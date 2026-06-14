#!/usr/bin/env python3
"""
prep_city.py — fetch real OSM buildings, compute energy metrics, save GeoJSON.

Install:
    pip install osmnx geopandas shapely numpy rasterio

Usage:
    python prep_city.py --city karlsruhe
    python prep_city.py --city bangalore
    python prep_city.py --all        # all presets in sequence

After running:
    cp cities/*.json ../apps/web/public/data/
"""

import json
import math
import argparse
from pathlib import Path

import numpy as np
import geopandas as gpd
import osmnx as ox

# ── Global Solar Atlas raster (world coverage -180→180, -60→65) ──────────────
_GHI_TIF = (
    "/srv/THESIS/energy_profiling_thesis/rasters/global_solar_atlas/"
    "World_GHI_GISdata_LTAy_AvgDailyTotals_GlobalSolarAtlas-v2_GEOTIFF/GHI.tif"
)

# Panel assumptions (conservative Central-Europe / global mixed stock)
_PANEL_EFF        = 0.20
_PERFORMANCE_RATIO = 0.80
_ROOF_UTILIZATION  = 0.60

# Heat loss coefficients kWh/m³/year by OSM building tag (IWU model)
_HEAT_COEFF: dict[str, float] = {
    "residential": 80.0, "house": 85.0, "detached": 85.0,
    "semidetached_house": 80.0, "terrace": 78.0,
    "apartments": 60.0, "flat": 60.0,
    "commercial": 45.0, "retail": 42.0, "shop": 42.0,
    "office": 42.0, "civic": 40.0, "public": 40.0,
    "industrial": 25.0, "warehouse": 20.0, "garage": 15.0,
    "yes": 70.0,   # unknown type — use average
}
_HEAT_DEFAULT = 65.0

# City presets: (display_name, lat, lon, bearing_deg, radius_km)
CITIES: dict[str, tuple[str, float, float, int, float]] = {
    "karlsruhe": ("Karlsruhe",  49.0093,  8.4044, -15, 1.5),
    "bangalore":  ("Bangalore",  12.9716, 77.5946, -20, 1.5),
    "berlin":     ("Berlin",     52.5200, 13.4050,  10, 1.5),
    "munich":     ("Munich",     48.1351, 11.5820,  -5, 1.5),
    "amsterdam":  ("Amsterdam",  52.3702,  4.8952,  15, 1.5),
    "london":     ("London",     51.5074, -0.1278,   0, 1.5),
    "paris":      ("Paris",      48.8566,  2.3522,   5, 1.5),
}


# ── Irradiance ────────────────────────────────────────────────────────────────

def sample_ghi(lat: float, lon: float) -> float:
    """Sample GHI kWh/m²/day from the Global Solar Atlas raster."""
    try:
        import rasterio
        with rasterio.open(_GHI_TIF) as src:
            r, c = src.index(lon, lat)
            val = float(src.read(1)[r, c])
            if 0.5 < val < 12.0:
                return val
    except Exception:
        pass
    # Geometric fallback (latitude-only estimate)
    return max(1.5, 6.0 * math.cos(math.radians(abs(lat) - 10)))


# ── OSM fetch ─────────────────────────────────────────────────────────────────

def bbox_from_center(lat: float, lon: float, r_km: float) -> tuple[float, float, float, float]:
    d_lat = r_km / 111.0
    d_lon = r_km / (111.0 * math.cos(math.radians(lat)))
    return lat + d_lat, lat - d_lat, lon + d_lon, lon - d_lon   # N S E W


def fetch_buildings(city_key: str, radius_km: float | None = None) -> gpd.GeoDataFrame:
    display, lat, lon, _bearing, default_r = CITIES[city_key]
    r = radius_km or default_r
    north, south, east, west = bbox_from_center(lat, lon, r)
    print(f"Fetching {display}  ({south:.4f},{west:.4f}) → ({north:.4f},{east:.4f})")

    major = int(ox.__version__.split(".")[0])
    if major >= 2:
        gdf = ox.features_from_bbox(bbox=(west, south, east, north), tags={"building": True})
    else:
        gdf = ox.features_from_bbox(north, south, east, west, tags={"building": True})

    print(f"  Raw features: {len(gdf)}")
    return gdf


# ── Height extraction ─────────────────────────────────────────────────────────

def extract_height(row) -> float:
    for col in ("height", "building:height"):
        val = row.get(col)
        if val and val == val:
            try:
                s = str(val).lower().replace(",", ".").strip()
                is_ft = "ft" in s or "'" in s
                num = float(s.replace("m","").replace("ft","").replace("'","").strip())
                if is_ft:
                    num *= 0.3048
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


# ── Metrics ───────────────────────────────────────────────────────────────────

def local_utm_crs(gdf: gpd.GeoDataFrame) -> str:
    # Sample a single vertex to find the zone — avoids centroid-on-geographic-CRS warning
    geom = gdf.to_crs("EPSG:4326").geometry.iloc[0]
    lon, lat = geom.bounds[0], geom.bounds[1]
    zone = int((lon + 180) / 6) + 1
    epsg = 32600 + zone if lat >= 0 else 32700 + zone
    return f"EPSG:{epsg}"


def compute_metrics(gdf: gpd.GeoDataFrame, ghi_annual: float) -> gpd.GeoDataFrame:
    gdf = gdf[gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])].copy()

    utm = local_utm_crs(gdf)
    gdf["footprint_area"] = gdf.to_crs(utm).geometry.area.round(1)
    gdf = gdf[gdf["footprint_area"] > 8.0].copy()

    gdf["height"] = gdf.apply(extract_height, axis=1)
    gdf["levels"] = (gdf["height"] / 3.5).round(0).clip(1, 120).astype(int)
    gdf["volume"] = (gdf["footprint_area"] * gdf["height"]).round(1)

    # Building type
    btype_col = gdf["building"] if "building" in gdf.columns else None
    gdf["building_type"] = (btype_col.fillna("yes").astype(str)
                             if btype_col is not None else "yes")

    # Actual energy estimates
    solar_factor = ghi_annual * _PANEL_EFF * _PERFORMANCE_RATIO * _ROOF_UTILIZATION
    gdf["solar_kwh_year"] = (gdf["footprint_area"] * solar_factor).round(0)

    def heat_coeff(btype: str) -> float:
        return _HEAT_COEFF.get(btype.lower(), _HEAT_DEFAULT)

    gdf["heat_kwh_year"] = (
        gdf["volume"] * gdf["building_type"].map(heat_coeff)
    ).round(0)

    # Normalised 0–1 for coloring (95th-pct cap)
    p95_sol  = float(np.percentile(gdf["solar_kwh_year"],  95))
    p95_heat = float(np.percentile(gdf["heat_kwh_year"],   95))
    gdf["solar_potential"]   = (gdf["solar_kwh_year"]  / p95_sol ).clip(0, 1).round(3)
    gdf["heat_demand_proxy"] = (gdf["heat_kwh_year"]   / p95_heat).clip(0, 1).round(3)

    return gdf


# ── GeoJSON output ────────────────────────────────────────────────────────────

def to_geojson(gdf: gpd.GeoDataFrame, city_key: str, ghi_annual: float) -> dict:
    keep = [
        "height", "levels", "footprint_area", "volume", "building_type",
        "solar_kwh_year", "heat_kwh_year", "solar_potential", "heat_demand_proxy",
    ]
    gdf = gdf.to_crs("EPSG:4326")
    cols = [c for c in keep if c in gdf.columns] + ["geometry"]
    out = gdf[cols].reset_index(drop=True)

    _, lat, lon, bearing, _ = CITIES[city_key]
    fc = json.loads(out.to_json())
    fc["city"]          = city_key
    fc["label"]         = CITIES[city_key][0]
    fc["feature_count"] = len(fc["features"])
    fc["center"]        = {"lat": lat, "lon": lon, "bearing": bearing}
    fc["irradiance"]    = {
        "ghi_annual_kwh_m2": round(ghi_annual, 0),
        "source": "Global Solar Atlas v2 (ESMAP/World Bank)",
    }
    fc["note"] = "real OSM geometry via osmnx"
    return fc


# ── Main ──────────────────────────────────────────────────────────────────────

def process(city_key: str, out_dir: Path, radius_km: float | None = None) -> None:
    _, lat, lon, _, _ = CITIES[city_key]
    ghi_day    = sample_ghi(lat, lon)
    ghi_annual = round(ghi_day * 365, 0)
    print(f"  GHI: {ghi_day:.3f} kWh/m²/day → {ghi_annual:.0f} kWh/m²/yr")

    gdf = fetch_buildings(city_key, radius_km)
    gdf = compute_metrics(gdf, ghi_annual)
    fc  = to_geojson(gdf, city_key, ghi_annual)

    out = out_dir / f"{city_key}.json"
    with open(out, "w") as f:
        json.dump(fc, f, separators=(",", ":"))

    n  = fc["feature_count"]
    kb = out.stat().st_size / 1024
    print(f"  Saved {n} buildings → {out}  ({kb:.0f} KB)\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--city", default="karlsruhe", choices=list(CITIES.keys()))
    parser.add_argument("--all",    action="store_true", help="Process all presets")
    parser.add_argument("--radius", type=float, default=None)
    parser.add_argument("--out-dir", default="cities")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    cities = list(CITIES.keys()) if args.all else [args.city]
    for c in cities:
        print(f"[{c}]")
        process(c, out_dir, args.radius)

    print("Copy to web app:")
    for c in cities:
        print(f"  cp cities/{c}.json ../apps/web/public/data/")


if __name__ == "__main__":
    main()
