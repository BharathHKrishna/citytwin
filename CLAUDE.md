# CityTwin — 3D Energy Digital Twin

Interactive 3D web app: real building footprints + heights extruded in-browser, colored by energy metrics (solar potential, heat demand, height). Users orbit, click buildings to inspect stats, and switch coloring metrics.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| 3D rendering | deck.gl GeoJsonLayer (extruded) | Built for geospatial — handles projection, extrusion, picking out of the box |
| Basemap | MapLibre GL via react-map-gl | Free, no Mapbox token needed |
| Building data | OSM via osmnx (offline prep) | Fetched once per city, saved as static GeoJSON |
| Frontend | Vite + React + TypeScript | |
| Data pipeline | Python / osmnx / geopandas | Runs offline, outputs per-city JSON to `data/cities/` |

## Repo layout

```
apps/web/          Vite + React frontend
  public/data/     Per-city GeoJSON served as static files (copy from data/cities/)
  src/
    components/    CityViewer (deck.gl), BuildingPanel, Legend
    lib/           colorScales (heatColor, normalizedColor)
    types.ts       BuildingFeature, MetricKey, BuildingProperties
    App.tsx        Top-level state: city, selectedBuilding, activeMetric

data/
  prep_city.py     Fetch OSM buildings → compute metrics → save JSON
  cities/          Output directory (not committed — large files)
```

## Weekend build order

1. **W1** — One city renders in 3D (Karlsruhe). Orbit works.
2. **W2** — Energy coloring + legend. Solar potential from real irradiance data.
3. **W3** — Click-to-inspect panel + metric switcher with smooth transitions.
4. **W4** — Multi-city support, fly-to animation, polish.
5. **W5** — Deploy (Vercel), README gif, demo video.

## Data pipeline

```bash
pip install osmnx geopandas shapely numpy
cd data
python prep_city.py --city karlsruhe
cp cities/karlsruhe.json ../apps/web/public/data/
```

## Running the web app

```bash
cd apps/web
npm install
npm run dev
```

## Energy metrics (all indicative / proxy values)

- **solar_potential**: normalized roof area (larger roof → higher potential). W2 will add actual irradiance from PVGIS/ERA5.
- **heat_demand_proxy**: normalized building volume (more volume → more to heat).
- **height**: raw building height in meters.

## Design decisions

- Don't scientifically perfect the metrics — label them "indicative". Recruiters care about the twin, not the physics model.
- Clip to a ~1.5 km center bbox per city — keeps building counts in the 3k–8k range where deck.gl is smooth.
- No backend for W1–W4 — just static JSON served from Vite's public/ dir.
