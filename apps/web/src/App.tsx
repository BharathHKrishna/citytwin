import { useState, useEffect, useCallback } from 'react';
import { FlyToInterpolator } from '@deck.gl/core';
import CityViewer from './components/CityViewer';
import BuildingPanel from './components/BuildingPanel';
import Legend from './components/Legend';
import CitySearch from './components/CitySearch';
import MetricCards from './components/MetricCards';
import Tooltip from './components/Tooltip';
import { BuildingFeature, CityConfig, CityManifest, MetricKey } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ViewState = any;

function cityViewState(city: CityConfig): ViewState {
  return {
    longitude: city.lon,
    latitude:  city.lat,
    zoom:      13.5,
    pitch:     60,
    bearing:   city.bearing ?? -15,
  };
}

export default function App() {
  const [cities,      setCities]      = useState<CityConfig[]>([]);
  const [activeCity,  setActiveCity]  = useState<CityConfig | null>(null);
  const [buildings,   setBuildings]   = useState<BuildingFeature[]>([]);
  const [ghiAnnual,   setGhiAnnual]   = useState<number | null>(null);
  const [count,       setCount]       = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [viewState,   setViewState]   = useState<ViewState>({ longitude: 8.4, latitude: 49.0, zoom: 4, pitch: 0, bearing: 0 });
  const [selected,    setSelected]    = useState<BuildingFeature | null>(null);
  const [metric,      setMetric]      = useState<MetricKey>('solar_potential');
  const [hovered,     setHovered]     = useState<BuildingFeature | null>(null);
  const [pointer,     setPointer]     = useState({ x: 0, y: 0 });

  // Load manifest — the source of truth for which cities exist
  useEffect(() => {
    fetch('/data/manifest.json')
      .then(r => r.json())
      .then((m: CityManifest) => {
        setCities(m.cities);
        if (m.cities.length > 0) loadCity(m.cities[0]);
      })
      .catch(() => {
        // Manifest missing — app still works, just show error in search
        setLoading(false);
        setError('No manifest.json found. Run: python data/prep_city.py --query "Your City"');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCity = useCallback((city: CityConfig) => {
    setLoading(true);
    setSelected(null);
    setHovered(null);
    setError(null);

    fetch(`/data/${city.key}.json`)
      .then(r => {
        if (!r.ok) throw new Error(
          `No data for "${city.label}". Run:\n  python data/prep_city.py --query "${city.label}"\n  cp data/cities/${city.key}.json apps/web/public/data/`
        );
        return r.json();
      })
      .then(data => {
        setActiveCity(city);
        setBuildings(data.features as BuildingFeature[]);
        setGhiAnnual(data.irradiance?.ghi_annual_kwh_m2 ?? null);
        setCount(data.feature_count ?? data.features.length);
        setLoading(false);
      })
      .catch(err => {
        setError(String(err.message));
        setLoading(false);
      });
  }, []);

  const switchCity = useCallback((city: CityConfig) => {
    if (city.key === activeCity?.key) return;
    setViewState({
      ...cityViewState(city),
      transitionInterpolator: new FlyToInterpolator({ speed: 2.0 }),
      transitionDuration: 'auto',
    });
    loadCity(city);
  }, [activeCity, loadCity]);

  const handleHover = useCallback((b: BuildingFeature | null, x: number, y: number) => {
    setHovered(b);
    if (b) setPointer({ x, y });
  }, []);

  return (
    <div className="app">
      <CityViewer
        buildings={buildings}
        activeMetric={metric}
        viewState={viewState}
        onViewStateChange={setViewState}
        onBuildingClick={b => { setSelected(b); setHovered(null); }}
        onBuildingHover={handleHover}
      />

      {/* Toolbar — city search + meta */}
      <div className="toolbar">
        <div className="toolbar-left">
          <CitySearch
            cities={cities}
            activeCity={activeCity}
            onSelect={switchCity}
            loading={loading}
          />
          {activeCity && !loading && (
            <div className="toolbar-meta">
              {count.toLocaleString()} buildings
              {ghiAnnual && (
                <span className="ghi-badge">☀ {ghiAnnual.toLocaleString()} kWh/m²/yr</span>
              )}
            </div>
          )}
          {error && <div className="toolbar-error">{error.split('\n')[0]}</div>}
        </div>
      </div>

      {/* Metric cards */}
      <MetricCards
        activeMetric={metric}
        onSelect={m => { setMetric(m); setSelected(null); }}
        buildings={buildings}
      />

      <Legend activeMetric={metric} />

      {hovered && !selected && (
        <Tooltip building={hovered} x={pointer.x} y={pointer.y} activeMetric={metric} />
      )}

      {selected && (
        <BuildingPanel building={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
