#!/usr/bin/env python3
"""
generate_mock.py — synthetic building data for offline development.

Generates ~3 000 buildings per city in a realistic grid pattern.
Real GHI / PVOUT values are sampled from the Global Solar Atlas rasters
(world coverage) so energy estimates reflect actual local irradiance.

Week 2: real irradiance per building.
Week 3: multi-city support.

Usage:
    python generate_mock.py --city karlsruhe
    python generate_mock.py --all          # generate all cities
"""

import json
import math
import random
import argparse
from pathlib import Path

# ── Global Solar Atlas raster paths ──────────────────────────────────────────
_BASE = "/srv/THESIS/energy_profiling_thesis/rasters/global_solar_atlas"
GHI_TIF   = f"{_BASE}/World_GHI_GISdata_LTAy_AvgDailyTotals_GlobalSolarAtlas-v2_GEOTIFF/GHI.tif"
PVOUT_TIF = f"{_BASE}/World_PVOUT_GISdata_LTAy_AvgDailyTotals_GlobalSolarAtlas-v2_GEOTIFF/PVOUT.tif"

# Pre-sampled fallbacks (kWh/m²/day) in case rasterio is unavailable
GHI_FALLBACK = {
    "karlsruhe": 3.243,
    "bangalore":  5.288,
    "berlin":     2.929,
    "munich":     3.246,
    "amsterdam":  2.877,
}

# ── City presets ──────────────────────────────────────────────────────────────
# (label, lat, lon, bearing_deg, building_character)
CITY_DEFS: dict[str, tuple] = {
    "karlsruhe": ("Karlsruhe",  49.0093,  8.4044,  -15, "european_mixed"),
    "bangalore":  ("Bangalore",  12.9716, 77.5946,  -20, "south_asian"),
    "berlin":     ("Berlin",     52.5200, 13.4050,   10, "northern_european"),
    "munich":     ("Munich",     48.1351, 11.5820,   -5, "european_mixed"),
    "amsterdam":  ("Amsterdam",  52.3702,  4.8952,   15, "low_country"),
}

# ── Building type profiles ────────────────────────────────────────────────────
# Each character defines zone composition and building geometry distributions
BUILDING_PROFILES: dict[str, list[dict]] = {
    "european_mixed": [
        dict(dy=0,    dx=0,    r=300, density=0.85, w=(10,25),  h=(15,30),  height=(8,18),  btype="residential",  angle=5),
        dict(dy=0,    dx=0,    r=600, density=0.65, w=(15,40),  h=(20,50),  height=(10,28), btype="commercial",   angle=8),
        dict(dy=150,  dx=-200, r=400, density=0.50, w=(30,80),  h=(30,100), height=(12,40), btype="office",       angle=3),
        dict(dy=500,  dx=100,  r=500, density=0.55, w=(8,18),   h=(12,22),  height=(7,14),  btype="residential",  angle=12),
        dict(dy=-400, dx=50,   r=400, density=0.55, w=(8,18),   h=(12,22),  height=(7,14),  btype="residential",  angle=10),
        dict(dy=-100, dx=700,  r=400, density=0.40, w=(40,120), h=(30,80),  height=(5,12),  btype="industrial",   angle=0),
        dict(dy=200,  dx=-600, r=350, density=0.45, w=(20,35),  h=(40,70),  height=(15,35), btype="apartments",   angle=2),
    ],
    "south_asian": [
        # Dense mixed-use core
        dict(dy=0,    dx=0,    r=250, density=0.90, w=(6,20),   h=(8,25),   height=(6,22),  btype="commercial",   angle=8),
        # Tech corridor (offices)
        dict(dy=200,  dx=300,  r=500, density=0.55, w=(40,150), h=(40,120), height=(15,60), btype="office",       angle=2),
        # Residential north
        dict(dy=500,  dx=-100, r=500, density=0.65, w=(7,16),   h=(10,20),  height=(5,16),  btype="residential",  angle=10),
        # Residential south
        dict(dy=-500, dx=50,   r=450, density=0.65, w=(7,16),   h=(10,20),  height=(5,16),  btype="residential",  angle=8),
        # Apartments
        dict(dy=100,  dx=-500, r=400, density=0.50, w=(20,40),  h=(30,60),  height=(18,45), btype="apartments",   angle=4),
        # Industrial east
        dict(dy=-100, dx=650,  r=350, density=0.35, w=(50,150), h=(40,100), height=(4,10),  btype="industrial",   angle=0),
    ],
    "northern_european": [
        # Berlin-style large residential blocks (Plattenbau / Mietskaserne)
        dict(dy=0,    dx=0,    r=400, density=0.70, w=(20,50),  h=(50,120), height=(12,22), btype="apartments",   angle=5),
        # Commercial centre
        dict(dy=0,    dx=0,    r=250, density=0.80, w=(15,40),  h=(20,60),  height=(10,30), btype="commercial",   angle=6),
        # Office belt
        dict(dy=300,  dx=200,  r=450, density=0.50, w=(30,90),  h=(30,100), height=(15,45), btype="office",       angle=3),
        # Residential suburbs
        dict(dy=600,  dx=-100, r=500, density=0.50, w=(10,22),  h=(15,30),  height=(8,15),  btype="residential",  angle=14),
        dict(dy=-500, dx=100,  r=450, density=0.50, w=(10,22),  h=(15,30),  height=(8,15),  btype="residential",  angle=12),
        # Industrial
        dict(dy=-200, dx=700,  r=400, density=0.38, w=(50,140), h=(40,90),  height=(5,14),  btype="industrial",   angle=0),
    ],
    "low_country": [
        # Amsterdam canal-house style: narrow, tall, dense
        dict(dy=0,    dx=0,    r=300, density=0.85, w=(5,10),   h=(10,20),  height=(12,22), btype="residential",  angle=3),
        # Mixed commercial ring
        dict(dy=0,    dx=0,    r=600, density=0.65, w=(8,25),   h=(15,40),  height=(8,20),  btype="commercial",   angle=5),
        # Office zone
        dict(dy=200,  dx=-300, r=350, density=0.50, w=(25,70),  h=(25,80),  height=(10,35), btype="office",       angle=2),
        # Residential districts
        dict(dy=550,  dx=50,   r=450, density=0.55, w=(8,18),   h=(12,25),  height=(7,14),  btype="residential",  angle=10),
        dict(dy=-450, dx=-50,  r=400, density=0.55, w=(8,18),   h=(12,25),  height=(7,14),  btype="residential",  angle=8),
        # Port / industrial
        dict(dy=-100, dx=650,  r=400, density=0.40, w=(50,150), h=(40,90),  height=(5,14),  btype="industrial",   angle=0),
    ],
}

# Heat demand coefficients kWh/m³/year (IWU German building stock, adapted)
HEAT_COEFF: dict[str, float] = {
    "residential": 80.0,
    "apartments":  60.0,
    "commercial":  45.0,
    "office":      42.0,
    "industrial":  25.0,
}

# Panel assumptions
PANEL_EFF        = 0.20
PERFORMANCE_RATIO = 0.80
ROOF_UTILIZATION  = 0.60

M_PER_DEG_LAT = 111_320.0


def deg_per_meter(lat: float) -> tuple[float, float]:
    dlat = 1.0 / M_PER_DEG_LAT
    dlon = 1.0 / (M_PER_DEG_LAT * math.cos(math.radians(lat)))
    return dlat, dlon


def sample_ghi(lat: float, lon: float) -> float:
    """Sample GHI (kWh/m²/day) from the Global Solar Atlas raster."""
    try:
        import rasterio
        with rasterio.open(GHI_TIF) as src:
            r, c = src.index(lon, lat)
            val = float(src.read(1)[r, c])
            if 0.5 < val < 12.0:
                return val
    except Exception:
        pass
    # Geometric fallback using latitude
    return max(1.5, 6.0 * math.cos(math.radians(abs(lat) - 10)))


def make_rect(cx: float, cy: float, w_m: float, h_m: float,
              lat: float, angle_deg: float = 0.0) -> list[list[float]]:
    dlat, dlon = deg_per_meter(lat)
    w2, h2 = w_m / 2, h_m / 2
    corners = [(-w2, -h2), (w2, -h2), (w2, h2), (-w2, h2)]
    a = math.radians(angle_deg)
    cos_a, sin_a = math.cos(a), math.sin(a)
    ring = []
    for mx, my in corners:
        rx = mx * cos_a - my * sin_a
        ry = mx * sin_a + my * cos_a
        ring.append([round(cx + rx * dlon, 7), round(cy + ry * dlat, 7)])
    ring.append(ring[0])
    return ring


def generate_city(city_key: str, seed_offset: int = 0) -> list[dict]:
    random.seed(42 + seed_offset)

    label, clat, clon, _bearing, character = CITY_DEFS[city_key]
    zones = BUILDING_PROFILES[character]

    ghi_day = sample_ghi(clat, clon)
    ghi_annual = ghi_day * 365
    solar_factor = ghi_annual * PANEL_EFF * PERFORMANCE_RATIO * ROOF_UTILIZATION

    print(f"  {label}: GHI={ghi_day:.3f} kWh/m²/day ({ghi_annual:.0f}/yr), "
          f"solar_factor={solar_factor:.1f} kWh/m²/yr")

    dlat, dlon = deg_per_meter(clat)
    buildings: list[dict] = []

    for zone in zones:
        dy_c, dx_c = zone["dy"], zone["dx"]
        r = zone["r"]
        density = zone["density"]
        w_lo, w_hi = zone["w"]
        h_lo, h_hi = zone["h"]
        ht_lo, ht_hi = zone["height"]
        btype = zone["btype"]
        angle_jitter = zone["angle"]

        avg_w = (w_lo + w_hi) / 2
        avg_h = (h_lo + h_hi) / 2
        gap = 4.0
        step_x = avg_w + gap
        step_y = avg_h + gap
        nx = int(2 * r / step_x) + 1
        ny = int(2 * r / step_y) + 1

        for ix in range(nx):
            for iy in range(ny):
                mx = (ix - nx / 2) * step_x + random.uniform(-step_x * 0.3, step_x * 0.3) + dx_c
                my = (iy - ny / 2) * step_y + random.uniform(-step_y * 0.3, step_y * 0.3) + dy_c
                if (mx - dx_c) ** 2 / r**2 + (my - dy_c) ** 2 / r**2 > 1.0:
                    continue
                if random.random() > density:
                    continue

                w = random.uniform(w_lo, w_hi)
                h = random.uniform(h_lo, h_hi)
                height = round(random.uniform(ht_lo, ht_hi), 1)
                angle = random.uniform(-angle_jitter, angle_jitter)

                cx = clon + mx * dlon
                cy = clat + my * dlat
                ring = make_rect(cx, cy, w, h, clat, angle)

                footprint_area = round(w * h, 1)
                volume = round(footprint_area * height, 1)
                solar_kwh_year = round(footprint_area * solar_factor, 0)
                heat_kwh_year  = round(volume * HEAT_COEFF.get(btype, 65.0), 0)

                buildings.append({
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [ring]},
                    "properties": {
                        "height": height,
                        "levels": max(1, round(height / 3.5)),
                        "footprint_area": footprint_area,
                        "volume": volume,
                        "building_type": btype,
                        "solar_kwh_year": solar_kwh_year,
                        "heat_kwh_year":  heat_kwh_year,
                        "_area": footprint_area,
                        "_sol":  solar_kwh_year,
                        "_heat": heat_kwh_year,
                    },
                })

    return buildings, ghi_annual


def normalise(features: list[dict]) -> list[dict]:
    sol_s  = sorted(f["properties"]["_sol"]  for f in features)
    heat_s = sorted(f["properties"]["_heat"] for f in features)
    p95_s = sol_s [int(0.95 * len(sol_s))]
    p95_h = heat_s[int(0.95 * len(heat_s))]

    for f in features:
        p = f["properties"]
        p["solar_potential"]   = round(min(p.pop("_sol")  / p95_s, 1.0), 3)
        p["heat_demand_proxy"] = round(min(p.pop("_heat") / p95_h, 1.0), 3)
        p.pop("_area", None)
    return features


def write_city(city_key: str, out_dir: Path, seed_offset: int = 0) -> None:
    label, clat, clon, bearing, _ = CITY_DEFS[city_key]
    features, ghi_annual = generate_city(city_key, seed_offset)
    features = normalise(features)

    fc = {
        "type": "FeatureCollection",
        "city": city_key,
        "label": label,
        "feature_count": len(features),
        "center": {"lat": clat, "lon": clon, "bearing": bearing},
        "irradiance": {
            "ghi_annual_kwh_m2": round(ghi_annual, 0),
            "source": "Global Solar Atlas v2 (ESMAP/World Bank)",
        },
        "note": "synthetic geometry, real irradiance (Global Solar Atlas GHI)",
        "features": features,
    }

    out = out_dir / f"{city_key}.json"
    with open(out, "w") as f:
        json.dump(fc, f, separators=(",", ":"))

    kb = out.stat().st_size / 1024
    print(f"  → {out}  ({len(features)} buildings, {kb:.0f} KB)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--city", default="karlsruhe", choices=list(CITY_DEFS.keys()))
    parser.add_argument("--all", action="store_true", help="Generate all cities")
    parser.add_argument("--out-dir", default="cities")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(exist_ok=True)

    cities = list(CITY_DEFS.keys()) if args.all else [args.city]

    print(f"Generating {len(cities)} city/cities...\n")
    for i, city_key in enumerate(cities):
        print(f"[{city_key}]")
        write_city(city_key, out_dir, seed_offset=i * 7)
        print()

    print("Done. Copy to web app:")
    for c in cities:
        print(f"  cp cities/{c}.json ../apps/web/public/data/")


if __name__ == "__main__":
    main()
