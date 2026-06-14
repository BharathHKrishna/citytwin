#!/usr/bin/env python3
"""
prep_city.py — fetch OSM buildings, compute energy proxy metrics, save GeoJSON.

Install:
    pip install osmnx geopandas shapely numpy

Usage:
    python prep_city.py --city karlsruhe
    python prep_city.py --city bangalore
    python prep_city.py --city berlin --radius 2.0

After running:
    cp data/cities/karlsruhe.json ../apps/web/public/data/
"""

import json
import math
import argparse
from pathlib import Path

import numpy as np
import geopandas as gpd
import osmnx as ox

# City center presets: (display_name, lat, lon, radius_km)
CITIES: dict[str, tuple[str, float, float, float]] = {
    "karlsruhe": ("Karlsruhe",  49.0093,  8.4044, 1.5),
    "bangalore":  ("Bangalore",  12.9716, 77.5946, 1.5),
    "berlin":     ("Berlin",     52.5200, 13.4050, 1.5),
    "munich":     ("Munich",     48.1351, 11.5820, 1.5),
    "amsterdam":  ("Amsterdam",  52.3702,  4.8952, 1.5),
    "london":     ("London",     51.5074, -0.1278, 1.5),
    "paris":      ("Paris",      48.8566,  2.3522, 1.5),
}


def bbox_from_center(lat: float, lon: float, radius_km: float) -> tuple[float, float, float, float]:
    """Return (north, south, east, west) bbox for a center point and radius."""
    d_lat = radius_km / 111.0
    d_lon = radius_km / (111.0 * math.cos(math.radians(lat)))
    return lat + d_lat, lat - d_lat, lon + d_lon, lon - d_lon


def fetch_buildings(city_key: str, radius_km: float | None = None) -> gpd.GeoDataFrame:
    display, lat, lon, default_radius = CITIES[city_key]
    r = radius_km or default_radius
    north, south, east, west = bbox_from_center(lat, lon, r)

    print(f"Fetching buildings for {display}  bbox: ({south:.4f},{west:.4f}) → ({north:.4f},{east:.4f})")

    # osmnx 2.x uses bbox=(west, south, east, north); 1.x used positional (north,south,east,west)
    import osmnx as _ox_ver
    major = int(_ox_ver.__version__.split(".")[0])
    if major >= 2:
        gdf = ox.features_from_bbox(bbox=(west, south, east, north), tags={"building": True})
    else:
        gdf = ox.features_from_bbox(north, south, east, west, tags={"building": True})

    print(f"  Raw features: {len(gdf)}")
    return gdf


def extract_height(row: gpd.GeoSeries) -> float:
    """Extract building height in metres from OSM tags, with fallbacks."""
    for col in ("height", "building:height"):
        val = row.get(col)
        if val and val == val:  # not NaN
            try:
                s = str(val).lower().replace(",", ".").strip()
                is_ft = "ft" in s or "'" in s
                numeric = float(s.replace("m", "").replace("ft", "").replace("'", "").strip())
                if is_ft:
                    numeric *= 0.3048
                if 1.0 < numeric < 600.0:
                    return round(numeric, 1)
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

    return 8.0  # default ~2 storeys


def local_utm_crs(gdf: gpd.GeoDataFrame) -> str:
    """Return an appropriate UTM EPSG code based on the GeoDataFrame centroid."""
    centroid = gdf.dissolve().to_crs("EPSG:4326").centroid.iloc[0]
    zone = int((centroid.x + 180) / 6) + 1
    epsg = 32600 + zone if centroid.y >= 0 else 32700 + zone
    return f"EPSG:{epsg}"


def compute_metrics(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Add height + energy proxy columns to the GeoDataFrame."""
    # Keep only polygon geometries
    gdf = gdf[gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])].copy()

    # Project to local UTM for accurate area calculation
    utm = local_utm_crs(gdf)
    gdf_m = gdf.to_crs(utm)
    gdf["footprint_area"] = gdf_m.geometry.area.round(1)

    # Drop tiny slivers / artifacts
    gdf = gdf[gdf["footprint_area"] > 8.0].copy()

    gdf["height"] = gdf.apply(extract_height, axis=1)
    gdf["levels"] = (gdf["height"] / 3.5).round(0).clip(1, 120).astype(int)
    gdf["volume"] = (gdf["footprint_area"] * gdf["height"]).round(1)

    # --- Solar potential (indicative) ---
    # Larger roof area = more potential.  Normalised to 95th-percentile.
    area_95 = float(np.percentile(gdf["footprint_area"], 95))
    gdf["solar_potential"] = (gdf["footprint_area"] / area_95).clip(0.0, 1.0).round(3)

    # --- Heat demand proxy (indicative) ---
    # More volume = more to heat.  Normalised to 95th-percentile.
    vol_95 = float(np.percentile(gdf["volume"], 95))
    gdf["heat_demand_proxy"] = (gdf["volume"] / vol_95).clip(0.0, 1.0).round(3)

    # Building type from OSM tag
    building_col = gdf.get("building") if "building" in gdf.columns else None
    if building_col is not None:
        gdf["building_type"] = building_col.fillna("unknown").astype(str)
    else:
        gdf["building_type"] = "unknown"

    return gdf


def to_geojson(gdf: gpd.GeoDataFrame, city_key: str) -> dict:
    """Convert to a compact GeoJSON FeatureCollection."""
    keep = [
        "height", "levels", "footprint_area", "volume",
        "solar_potential", "heat_demand_proxy", "building_type",
    ]
    gdf = gdf.to_crs("EPSG:4326")
    cols = [c for c in keep if c in gdf.columns] + ["geometry"]
    out = gdf[cols].reset_index(drop=True)

    fc = json.loads(out.to_json())
    fc["city"] = city_key
    fc["feature_count"] = len(fc["features"])
    return fc


def main() -> None:
    parser = argparse.ArgumentParser(description="Prep city building GeoJSON for CityTwin")
    parser.add_argument("--city", default="karlsruhe", choices=list(CITIES.keys()),
                        help="City to process (default: karlsruhe)")
    parser.add_argument("--radius", type=float, default=None,
                        help="Bounding-box radius in km around city centre (overrides preset)")
    parser.add_argument("--out-dir", default="cities",
                        help="Output directory (default: cities/)")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    gdf = fetch_buildings(args.city, args.radius)
    gdf = compute_metrics(gdf)
    fc = to_geojson(gdf, args.city)

    out_path = out_dir / f"{args.city}.json"
    with open(out_path, "w") as f:
        json.dump(fc, f, separators=(",", ":"))

    n = fc["feature_count"]
    kb = out_path.stat().st_size / 1024
    print(f"\nSaved {n} buildings → {out_path}  ({kb:.0f} KB)")
    print(f"\nNext step — copy to the web app:")
    print(f"  cp {out_path} ../apps/web/public/data/{args.city}.json")
    print(f"  cd ../apps/web && npm run dev")


if __name__ == "__main__":
    main()
