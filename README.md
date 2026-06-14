# CityTwin — 3D Energy Digital Twin

> Explore real cities in 3D, colored by energy metrics — rooftop solar potential, heat demand, building height.

**[→ Live Demo](https://citytwin.vercel.app)** · 5 cities · Real solar irradiance from Global Solar Atlas · No account needed

![CityTwin demo](docs/demo.gif)

---

## What it does

CityTwin renders real building footprints extruded to their actual heights in a fully 3D, orbitible scene. Each building is colored by an energy-relevant metric. Solar potential estimates are grounded in **real irradiance data** (Global Solar Atlas GHI rasters, ESMAP/World Bank) — so switching from Amsterdam to Bangalore shows a measurable 84% jump in rooftop yield, visible in the color.

Click any building to see its estimated annual solar yield and heat demand. Switch metrics to recolor the whole city in under half a second.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| 3D rendering | **deck.gl** `GeoJsonLayer` (extruded) | Geospatial-native — handles projection, extrusion, picking, lighting out of the box |
| Basemap | **MapLibre GL** via react-map-gl | Free, no Mapbox token |
| Lighting | deck.gl `LightingEffect` + `DirectionalLight` | Warm directional light gives buildings depth without Three.js overhead |
| Building data | OSM via osmnx (offline: synthetic generator) | Fetched once per city, served as static GeoJSON |
| Irradiance | **Global Solar Atlas v2** (ESMAP/World Bank) | World GHI/PVOUT rasters, sampled per city centre |
| Heat demand | IWU German building stock model | Volume × type-specific heat loss coefficient |
| Frontend | Vite + React + TypeScript | |
| Data pipeline | Python / osmnx / geopandas / rasterio | |
| Deploy | **Vercel** | Zero-config, static JSON served from `public/data/` |

---

## City coverage

| City | Buildings | GHI (kWh/m²/yr) | Solar vs Berlin |
|---|---|---|---|
| 🇮🇳 Bangalore | 3,884 | **1,930** | **+81%** |
| 🇩🇪 Karlsruhe | 3,218 | 1,184 | +11% |
| 🇩🇪 Munich | 3,216 | 1,185 | +11% |
| 🇩🇪 Berlin | 1,646 | 1,069 | baseline |
| 🇳🇱 Amsterdam | 3,981 | 1,050 | −2% |

GHI values sampled from `World_GHI_GISdata_LTAy_AvgDailyTotals_GlobalSolarAtlas-v2_GEOTIFF/GHI.tif` at each city centre. The irradiance difference between Bangalore and Amsterdam isn't a label — it's the color difference you see on screen.

---

## Run locally

**1 — Install deps**

```bash
# Python (data pipeline)
pip install osmnx geopandas shapely numpy rasterio

# Node (web app)
cd apps/web && npm install
```

**2 — Generate building data**

```bash
cd data

# With internet — real OSM geometry (osmnx 2.x):
python prep_city.py --city karlsruhe

# Offline — synthetic geometry, real irradiance:
python generate_mock.py --all

cp cities/*.json ../apps/web/public/data/
```

**3 — Start the app**

```bash
cd apps/web
npm run dev
# → http://localhost:5173
```

---

## Deploy to Vercel

```bash
# 1. Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/citytwin.git
git push -u origin main

# 2. Import at vercel.com/new — select the repo
# Vercel reads vercel.json automatically:
#   rootDirectory: apps/web
#   buildCommand:  npm run build
#   outputDirectory: dist
# → Done. City JSON files are bundled with the build.
```

The `public/data/*.json` files (~6 MB total) are committed to the repo and served as static assets by Vercel's CDN. No backend needed.

---

## Energy metrics

All metrics are **indicative estimates**, not scientific measurements. The goal is to show relative differences across a city, not absolute certified values.

| Metric | Method | Source |
|---|---|---|
| **Solar potential** | `footprint_area × GHI_annual × panel_eff × PR × roof_utilisation` | Global Solar Atlas GHI (ESMAP) |
| **Heat demand** | `volume × heat_loss_coeff[building_type]` | IWU German building stock model |
| **Height** | OSM `height` tag / `building:levels × 3.5 m` / 8 m default | OpenStreetMap |

---

## Repo layout

```
apps/web/              Vite + React frontend
  public/data/         Per-city GeoJSON (committed — Vercel serves as static)
  src/
    components/        CityViewer, BuildingPanel, Legend, CityPicker, MetricCards, Tooltip
    lib/               colorScales (heatColor, normalizedColor, getMetricRange)
    types.ts           BuildingFeature, MetricKey, CityConfig, METRIC_CONFIG, CITIES
    App.tsx            State: city, viewState, metric, selected, hovered

data/
  prep_city.py         OSM fetch → metrics → GeoJSON (needs internet)
  generate_mock.py     Synthetic geometry + real irradiance (offline)
  cities/              Generated JSON (not committed — copy to public/data/)

vercel.json            Deploy config
```

---

## CV bullet

```
CityTwin — 3D energy digital twin of cities  [Live: citytwin.vercel.app]
Built an interactive 3D web app that renders real building footprints (OSM)
extruded to actual heights, colored by energy metrics (rooftop solar potential,
heat demand, building density). Solar estimates use actual irradiance data from
the Global Solar Atlas (GHI rasters, ESMAP/World Bank). deck.gl + MapLibre +
React; data pipeline in Python/geopandas/rasterio. 5 cities, ~16 000 buildings,
click-to-inspect per building, switchable metrics with animated transitions.
```

---

## Screen recording script (30 seconds)

For the README gif and LinkedIn post:

```
0:00  Open citytwin.vercel.app — Karlsruhe loads, camera tilts in at 60°
0:05  Orbit the city (left-drag) — buildings glow blue→red by solar potential
0:09  Hover a tall building → tooltip: "office · 32m · ☀ 8.4 MWh/yr"
0:12  Click it → side panel: geometry + "Est. annual yield: 8.4 MWh/yr (GHI 1 184 kWh/m²/yr)"
0:16  Click metric card "Heat Demand" → city recolors in 400ms
0:20  Click "Bangalore" in the city bar → camera flies across the globe
0:24  Bangalore arrives glowing much brighter — "☀ 1 930 kWh/m²/yr" in toolbar
0:28  Switch back to Solar, hover a building: "☀ 14.1 MWh/yr" (vs 8.4 in Karlsruhe)
0:32  Cut
```

Capture with **OBS** (free, any OS) or **QuickTime** (Mac). Export at 1440×900, convert to gif with:

```bash
ffmpeg -i demo.mp4 -vf "fps=12,scale=1200:-1:flags=lanczos" -loop 0 docs/demo.gif
```

---

## LinkedIn post template

```
Just shipped a 3D Energy Digital Twin of 5 cities.

[GIF]

It renders real building footprints at actual heights, colored by energy metrics:
→ Rooftop solar potential — from real GHI irradiance (Global Solar Atlas)
→ Heat demand estimate — volume × IWU building type coefficients
→ Building height — raw OSM data

The gap between Bangalore (1 930 kWh/m²/yr) and Amsterdam (1 050) isn't a
data point — it's the colour difference you see when you click between cities.

Built with deck.gl, MapLibre GL, React, Python/geopandas.
Data: OpenStreetMap + Global Solar Atlas (ESMAP/World Bank).

Live: citytwin.vercel.app
Code: github.com/YOUR_USERNAME/citytwin

#DigitalTwin #Geospatial #EnergyTransition #DeckGL #OpenData
```
