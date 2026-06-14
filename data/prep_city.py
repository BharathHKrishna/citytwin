#!/usr/bin/env python3
"""
prep_city.py — fetch real OSM buildings for ANY city, compute energy metrics.

Works with any city on earth — not just presets.

Install:
    pip install osmnx geopandas shapely numpy rasterio requests

Usage:
    python prep_city.py --query "Mysore, India"
    python prep_city.py --query "Zurich"
    python prep_city.py --query "Cape Town, South Africa"
    python prep_city.py --query "Karlsruhe, Germany" --radius 2.0

After running, copy to web app and the manifest is updated automatically:
    cp cities/mysore.json ../apps/web/public/data/
    cp cities/manifest.json ../apps/web/public/data/
"""

import json
import math
import re
import argparse
import datetime
from pathlib import Path

import numpy as np
import geopandas as gpd
import osmnx as ox
import requests

# ── Global Solar Atlas raster ─────────────────────────────────────────────────
_GHI_TIF = (
    "/srv/THESIS/energy_profiling_thesis/rasters/global_solar_atlas/"
    "World_GHI_GISdata_LTAy_AvgDailyTotals_GlobalSolarAtlas-v2_GEOTIFF/GHI.tif"
)

_PANEL_EFF         = 0.20
_PERFORMANCE_RATIO  = 0.80
_ROOF_UTILIZATION   = 0.60

_HEAT_COEFF: dict[str, float] = {
    "residential": 80.0, "house": 85.0, "detached": 85.0,
    "semidetached_house": 80.0, "terrace": 78.0,
    "apartments": 60.0, "flat": 60.0,
    "commercial": 45.0, "retail": 42.0, "shop": 42.0,
    "office": 42.0, "civic": 40.0, "public": 40.0,
    "industrial": 25.0, "warehouse": 20.0, "garage": 15.0,
    "yes": 70.0,
}
_HEAT_DEFAULT = 65.0


# ── Geocoding ─────────────────────────────────────────────────────────────────

def geocode(query: str) -> dict:
    """
    Resolve any free-form city query → {key, label, lat, lon, country}.

    Uses Nominatim (OSM). Works for any city on earth:
        "Mysore, India"
        "Cape Town"
        "Ho Chi Minh City, Vietnam"
    """
    r = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": query, "format": "json", "limit": 1, "addressdetails": 1},
        headers={"User-Agent": "CityTwin/1.0 (github.com/BharathHKrishna/citytwin)"},
        timeout=15,
    )
    r.raise_for_status()
    results = r.json()
    if not results:
        raise ValueError(
            f"Nominatim found nothing for {query!r}. "
            "Try a more specific query, e.g. 'Mysore, Karnataka, India'."
        )
    res  = results[0]
    addr = res.get("address", {})

    label = (addr.get("city")
             or addr.get("town")
             or addr.get("municipality")
             or addr.get("village")
             or query.split(",")[0].strip().title())

    country = addr.get("country_code", "").upper()
    lat     = float(res["lat"])
    lon     = float(res["lon"])

    # Filesystem-safe key: "Mysore, India" → "mysore"
    key = re.sub(r"[^a-z0-9]", "_", query.split(",")[0].lower().strip())
    key = re.sub(r"_+", "_", key).strip("_")

    return {"key": key, "label": label, "lat": lat, "lon": lon, "country": country}


# ── Irradiance ────────────────────────────────────────────────────────────────

def sample_ghi(lat: float, lon: float) -> float:
    try:
        import rasterio
        with rasterio.open(_GHI_TIF) as src:
            row, col = src.index(lon, lat)
            val = float(src.read(1)[row, col])
            if 0.5 < val < 12.0:
                return val
    except Exception:
        pass
    return max(1.5, 6.0 * math.cos(math.radians(abs(lat) - 10)))


# ── OSM fetch ─────────────────────────────────────────────────────────────────

def fetch_buildings(lat: float, lon: float, label: str, r_km: float) -> gpd.GeoDataFrame:
    d_lat = r_km / 111.0
    d_lon = r_km / (111.0 * math.cos(math.radians(lat)))
    north, south = lat + d_lat, lat - d_lat
    east,  west  = lon + d_lon, lon - d_lon
    print(f"  Fetching {label}  ({south:.4f},{west:.4f}) → ({north:.4f},{east:.4f})")

    major = int(ox.__version__.split(".")[0])
    if major >= 2:
        gdf = ox.features_from_bbox(bbox=(west, south, east, north), tags={"building": True})
    else:
        gdf = ox.features_from_bbox(north, south, east, west, tags={"building": True})

    print(f"  Raw features: {len(gdf)}")
    return gdf


# ── Metrics ───────────────────────────────────────────────────────────────────

def local_utm_crs(gdf: gpd.GeoDataFrame) -> str:
    geom = gdf.to_crs("EPSG:4326").geometry.iloc[0]
    lon, lat = geom.bounds[0], geom.bounds[1]
    zone = int((lon + 180) / 6) + 1
    return f"EPSG:{32600 + zone if lat >= 0 else 32700 + zone}"


def extract_height(row) -> float:
    for col in ("height", "building:height"):
        val = row.get(col)
        if val and val == val:
            try:
                s = str(val).lower().replace(",", ".").strip()
                is_ft = "ft" in s or "'" in s
                num = float(s.replace("m","").replace("ft","").replace("'","").strip())
                if is_ft: num *= 0.3048
                if 1.0 < num < 600.0:
                    return round(num, 1)
            except (ValueError, TypeError):
                pass
    for col in ("building:levels", "levels"):
        val = row.get(col)
        if val and val == val:
            try:
                lvls = float(str(val).split(";")[0].strip())
                if 0 < lvls < 120:
                    return round(lvls * 3.5, 1)
            except (ValueError, TypeError):
                pass
    return 8.0


def compute_metrics(gdf: gpd.GeoDataFrame, ghi_annual: float) -> gpd.GeoDataFrame:
    gdf = gdf[gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])].copy()
    utm = local_utm_crs(gdf)
    gdf["footprint_area"] = gdf.to_crs(utm).geometry.area.round(1)
    gdf = gdf[gdf["footprint_area"] > 8.0].copy()

    gdf["height"] = gdf.apply(extract_height, axis=1)
    gdf["levels"] = (gdf["height"] / 3.5).round(0).clip(1, 120).astype(int)
    gdf["volume"] = (gdf["footprint_area"] * gdf["height"]).round(1)

    btype = gdf["building"] if "building" in gdf.columns else None
    gdf["building_type"] = btype.fillna("yes").astype(str) if btype is not None else "yes"

    sf = ghi_annual * _PANEL_EFF * _PERFORMANCE_RATIO * _ROOF_UTILIZATION
    gdf["solar_kwh_year"]  = (gdf["footprint_area"] * sf).round(0)
    gdf["heat_kwh_year"]   = (gdf["volume"] * gdf["building_type"]
                               .map(lambda b: _HEAT_COEFF.get(b.lower(), _HEAT_DEFAULT))).round(0)

    p95_s = float(np.percentile(gdf["solar_kwh_year"],  95))
    p95_h = float(np.percentile(gdf["heat_kwh_year"],   95))
    gdf["solar_potential"]   = (gdf["solar_kwh_year"]  / p95_s).clip(0, 1).round(3)
    gdf["heat_demand_proxy"] = (gdf["heat_kwh_year"]   / p95_h).clip(0, 1).round(3)

    return gdf


# ── Output ────────────────────────────────────────────────────────────────────

def to_geojson(gdf: gpd.GeoDataFrame, meta: dict, ghi_annual: float) -> dict:
    keep = [
        "height", "levels", "footprint_area", "volume", "building_type",
        "solar_kwh_year", "heat_kwh_year", "solar_potential", "heat_demand_proxy",
    ]
    gdf  = gdf.to_crs("EPSG:4326")
    cols = [c for c in keep if c in gdf.columns] + ["geometry"]
    out  = gdf[cols].reset_index(drop=True)

    fc = json.loads(out.to_json())
    fc.update({
        "city":          meta["key"],
        "label":         meta["label"],
        "country":       meta["country"],
        "feature_count": len(fc["features"]),
        "center":        {"lat": meta["lat"], "lon": meta["lon"], "bearing": -15},
        "irradiance":    {"ghi_annual_kwh_m2": round(ghi_annual, 0),
                          "source": "Global Solar Atlas v2 (ESMAP/World Bank)"},
        "note":          "real OSM geometry via osmnx",
    })
    return fc


def update_manifest(cities_dir: Path) -> None:
    """Rebuild manifest.json by scanning all city JSON files in cities_dir."""
    entries = []
    for path in sorted(cities_dir.glob("*.json")):
        if path.stem == "manifest":
            continue
        try:
            with open(path) as f:
                fc = json.load(f)
            c = fc.get("center", {})
            entries.append({
                "key":           fc.get("city",    path.stem),
                "label":         fc.get("label",   path.stem.title()),
                "country":       fc.get("country", ""),
                "lat":           c.get("lat",     0.0),
                "lon":           c.get("lon",     0.0),
                "bearing":       c.get("bearing", -15),
                "ghi_annual":    fc.get("irradiance", {}).get("ghi_annual_kwh_m2", 0),
                "feature_count": fc.get("feature_count", 0),
            })
        except Exception as e:
            print(f"  Warning: skipping {path.name}: {e}")

    manifest = {"cities": entries, "updated": datetime.date.today().isoformat()}
    out = cities_dir / "manifest.json"
    with open(out, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"  Manifest updated → {out}  ({len(entries)} cities)")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch OSM buildings for ANY city and compute energy metrics.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python prep_city.py --query "Mysore, India"
  python prep_city.py --query "Zurich"
  python prep_city.py --query "Cape Town, South Africa" --radius 2.0
  python prep_city.py --query "Ho Chi Minh City, Vietnam"
        """,
    )
    parser.add_argument("--query",    required=True,
                        help='City to fetch, e.g. "Mysore, India" or "Zurich"')
    parser.add_argument("--radius",   type=float, default=1.5,
                        help="Bounding-box radius in km around city centre (default: 1.5)")
    parser.add_argument("--out-dir",  default="cities")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Geocoding: {args.query!r}")
    meta = geocode(args.query)
    print(f"  → {meta['label']} ({meta['country']})  {meta['lat']:.4f}, {meta['lon']:.4f}")

    ghi_day    = sample_ghi(meta["lat"], meta["lon"])
    ghi_annual = round(ghi_day * 365, 0)
    print(f"  GHI: {ghi_day:.3f} kWh/m²/day → {ghi_annual:.0f} kWh/m²/yr")

    gdf = fetch_buildings(meta["lat"], meta["lon"], meta["label"], args.radius)
    gdf = compute_metrics(gdf, ghi_annual)
    fc  = to_geojson(gdf, meta, ghi_annual)

    out = out_dir / f"{meta['key']}.json"
    with open(out, "w") as f:
        json.dump(fc, f, separators=(",", ":"))

    n, kb = fc["feature_count"], out.stat().st_size / 1024
    print(f"\nSaved {n} buildings → {out}  ({kb:.0f} KB)")

    update_manifest(out_dir)

    print(f"""
Add to web app:
  cp {out}                ../apps/web/public/data/
  cp cities/manifest.json ../apps/web/public/data/
  cd .. && vercel --prod --yes
""")


if __name__ == "__main__":
    main()
