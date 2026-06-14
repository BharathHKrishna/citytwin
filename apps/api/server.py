#!/usr/bin/env python3
"""
CityTwin API — fetch + serve any city on demand.

Run:
    cd apps/api
    uvicorn server:app --reload --port 8000

Then npm run dev in apps/web/ will proxy /api → :8000.
"""
import json
import shutil
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

DATA_DIR   = Path(__file__).parent.parent.parent / "data"
CITIES_DIR = DATA_DIR / "cities"
PUBLIC_DIR = Path(__file__).parent.parent / "web" / "public" / "data"

sys.path.insert(0, str(DATA_DIR))
from prep_city import (
    geocode, fetch_buildings, compute_metrics,
    to_geojson, sample_ghi, update_manifest,
)

app = FastAPI(title="CityTwin API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/city")
async def get_city(
    query: str  = Query(...,   description='Free-form city, e.g. "Kolkata, India"'),
    radius: float = Query(1.5, description="Bounding-box radius in km (default 1.5)"),
    force:  bool  = Query(False, description="Re-fetch even if already cached"),
) -> Any:
    """
    Return GeoJSON FeatureCollection for any city on earth.

    - First call: geocode → OSM fetch → GHI sample → compute metrics (~15-40 s)
    - Subsequent calls: served from disk cache instantly
    - Result is also saved to apps/web/public/data/ so it persists across restarts
    """
    try:
        meta = geocode(query)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    cached = CITIES_DIR / f"{meta['key']}.json"
    if cached.exists() and not force:
        with open(cached) as f:
            return json.load(f)

    try:
        ghi_day    = sample_ghi(meta["lat"], meta["lon"])
        ghi_annual = round(ghi_day * 365, 0)
        gdf = fetch_buildings(meta["lat"], meta["lon"], meta["label"], radius)
        gdf = compute_metrics(gdf, ghi_annual)
        fc  = to_geojson(gdf, meta, ghi_annual)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {e}")

    CITIES_DIR.mkdir(parents=True, exist_ok=True)
    with open(cached, "w") as f:
        json.dump(fc, f, separators=(",", ":"))

    update_manifest(CITIES_DIR)

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy(cached,                         PUBLIC_DIR / cached.name)
    shutil.copy(CITIES_DIR / "manifest.json",   PUBLIC_DIR / "manifest.json")

    return fc


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
