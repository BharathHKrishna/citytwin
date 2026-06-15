"""
Vercel Python serverless function — /api/city?query=...&lat=...&lon=...

Runs without local rasters (uses PVGIS for GHI) and without osmnx/geopandas
(calls Overpass API directly). Designed to fit within Vercel's 10-second limit
for typical city-centre bounding boxes (1.5 km radius).
"""
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import json, math, re, hashlib, os

# ── tiny vendored deps (pure-Python, no heavy libs) ───────────────────────────
import requests

_PANEL_EFF  = 0.20
_PERF_RATIO = 0.80
_ROOF_UTIL  = 0.60

_HEAT: dict[str, float] = {
    "residential": 80, "house": 85, "detached": 85, "apartments": 60,
    "commercial": 45,  "office": 42, "retail": 42, "industrial": 25,
    "warehouse": 20,   "garage": 15, "yes": 70,
}
_HEAT_DEFAULT = 65.0


def _geocode(query: str) -> dict:
    r = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": query, "format": "json", "limit": 1, "addressdetails": 1},
        headers={"User-Agent": "CityTwin/1.0 (github.com/BharathHKrishna/citytwin)"},
        timeout=6,
    )
    results = r.json()
    if not results:
        raise ValueError(f"City not found: {query!r}")
    res  = results[0]
    addr = res.get("address", {})
    label = (addr.get("city") or addr.get("town") or addr.get("municipality")
             or query.split(",")[0].strip().title())
    return {
        "key":     re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_"),
        "label":   label,
        "country": addr.get("country_code", "").upper(),
        "lat":     float(res["lat"]),
        "lon":     float(res["lon"]),
    }


def _ghi(lat: float, lon: float) -> float:
    """Annual GHI kWh/m²/yr via PVGIS radiation endpoint."""
    try:
        r = requests.get(
            "https://re.jrc.ec.europa.eu/api/v5_2/seriescalc",
            params={"lat": lat, "lon": lon, "outputformat": "json",
                    "startyear": 2019, "endyear": 2019},
            timeout=7,
        )
        data = r.json()
        # Sum hourly G(i) values (W/m²) → kWh/m²/yr  ÷ 1000
        total_wh = sum(h.get("G(i)", 0) for h in data.get("outputs", {}).get("hourly", []))
        if total_wh > 0:
            return round(total_wh / 1000, 0)
    except Exception:
        pass
    # Fallback: latitude-based estimate
    return round(max(800, 2200 * math.cos(math.radians(abs(lat) * 0.9))), 0)


def _overpass(lat: float, lon: float, radius_km: float) -> list[dict]:
    d = radius_km / 111.0
    d_lon = radius_km / (111.0 * math.cos(math.radians(lat)))
    bbox = f"{lat-d:.5f},{lon-d_lon:.5f},{lat+d:.5f},{lon+d_lon:.5f}"
    query = (
        f'[out:json][timeout:20];'
        f'(way["building"]({bbox}););'
        f'out geom;'
    )
    r = requests.post(
        "https://overpass-api.de/api/interpreter",
        data={"data": query},
        timeout=22,
    )
    return r.json().get("elements", [])


def _area(nodes: list[dict]) -> float:
    """Shoelace formula for polygon area in m²."""
    if len(nodes) < 3:
        return 0.0
    lats = [math.radians(n["lat"]) for n in nodes]
    lons = [math.radians(n["lon"]) for n in nodes]
    R = 6_371_000.0
    n = len(lats)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += (lons[j] - lons[i]) * (math.sin(lats[i]) + math.sin(lats[j]))
    return abs(area) * R * R / 2.0


def _height(el: dict) -> float:
    for tag in ("height", "building:height"):
        v = el.get("tags", {}).get(tag, "")
        if v:
            try:
                s = str(v).lower()
                is_ft = "ft" in s or "'" in s
                num = float(re.sub(r"[^\d.]", "", s) or "0")
                if is_ft: num *= 0.3048
                if 1 < num < 600: return round(num, 1)
            except ValueError:
                pass
    for tag in ("building:levels", "levels"):
        v = el.get("tags", {}).get(tag, "")
        if v:
            try:
                lvls = float(str(v).split(";")[0])
                if 0 < lvls < 120: return round(lvls * 3.5, 1)
            except ValueError:
                pass
    return 8.0


def _build_fc(elements: list[dict], meta: dict, ghi: float) -> dict:
    features = []
    solar_vals, heat_vals = [], []

    sf = ghi * _PANEL_EFF * _PERF_RATIO * _ROOF_UTIL

    for el in elements:
        nodes = el.get("geometry", [])
        if len(nodes) < 4:
            continue
        area = _area(nodes)
        if area < 8:
            continue
        h   = _height(el)
        vol = area * h
        bt  = el.get("tags", {}).get("building", "yes")
        solar = round(area * sf, 0)
        heat  = round(vol * _HEAT.get(bt.lower(), _HEAT_DEFAULT), 0)
        solar_vals.append(solar)
        heat_vals.append(heat)
        coords = [[n["lon"], n["lat"]] for n in nodes]
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [coords]},
            "properties": {
                "height": h,
                "levels": max(1, round(h / 3.5)),
                "footprint_area": round(area, 1),
                "volume": round(vol, 1),
                "building_type": bt,
                "solar_kwh_year": solar,
                "heat_kwh_year":  heat,
                "solar_potential":   0.0,
                "heat_demand_proxy": 0.0,
            },
        })

    if not features:
        return {"type": "FeatureCollection", "features": [], "feature_count": 0}

    # Normalise to [0, 1] using 95th percentile
    def pct95(vals: list[float]) -> float:
        s = sorted(vals)
        idx = max(0, int(len(s) * 0.95) - 1)
        return s[idx] or 1.0

    p95s = pct95(solar_vals)
    p95h = pct95(heat_vals)
    for f in features:
        p = f["properties"]
        p["solar_potential"]   = round(min(1.0, p["solar_kwh_year"]  / p95s), 3)
        p["heat_demand_proxy"] = round(min(1.0, p["heat_kwh_year"]   / p95h), 3)

    return {
        "type": "FeatureCollection",
        "features": features,
        "city":          meta["key"],
        "label":         meta["label"],
        "country":       meta["country"],
        "feature_count": len(features),
        "center":        {"lat": meta["lat"], "lon": meta["lon"], "bearing": -15},
        "irradiance":    {"ghi_annual_kwh_m2": ghi,
                          "source": "PVGIS / JRC (EU)"},
        "note": "real OSM geometry via Overpass API",
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):                                          # noqa: N802
        qs     = parse_qs(urlparse(self.path).query)
        query  = (qs.get("query",  [""])[0]).strip()
        lat_s  = qs.get("lat",    [None])[0]
        lon_s  = qs.get("lon",    [None])[0]
        label  = qs.get("label",  [None])[0]
        country= qs.get("country",[""]) [0]
        radius = float(qs.get("radius", ["1.5"])[0])

        try:
            if lat_s and lon_s and label:
                key = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
                meta = {"key": key, "label": label, "country": country,
                        "lat": float(lat_s), "lon": float(lon_s)}
            else:
                meta = _geocode(query)

            ghi      = _ghi(meta["lat"], meta["lon"])
            elements = _overpass(meta["lat"], meta["lon"], radius)
            fc       = _build_fc(elements, meta, ghi)

            body = json.dumps(fc, separators=(",", ":")).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)

        except Exception as exc:
            err = json.dumps({"detail": str(exc)}).encode()
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(err)
