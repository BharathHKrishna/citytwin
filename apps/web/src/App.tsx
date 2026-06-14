import { useState, useEffect, useCallback } from 'react';
import { FlyToInterpolator } from '@deck.gl/core';
import CityViewer from './components/CityViewer';
import BuildingPanel from './components/BuildingPanel';
import Legend from './components/Legend';
import CityPicker from './components/CityPicker';
import MetricCards from './components/MetricCards';
import Tooltip from './components/Tooltip';
import { BuildingFeature, MetricKey, CITIES } from './types';

const DEFAULT_CITY = 'karlsruhe';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ViewState = any;

interface CityMeta {
  ghi_annual?: number;
  count: number;
}

function cityView(key: string): ViewState {
  return { ...CITIES[key].view };
}

export default function App() {
  const [activeCityKey, setActiveCityKey]   = useState(DEFAULT_CITY);
  const [buildings, setBuildings]           = useState<BuildingFeature[]>([]);
  const [meta, setMeta]                     = useState<CityMeta>({ count: 0 });
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const [viewState, setViewState]           = useState<ViewState>(cityView(DEFAULT_CITY));
  const [selected, setSelected]             = useState<BuildingFeature | null>(null);
  const [metric, setMetric]                 = useState<MetricKey>('solar_potential');
  const [hovered, setHovered]               = useState<BuildingFeature | null>(null);
  const [pointer, setPointer]               = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const loadCity = useCallback((cityKey: string) => {
    setLoading(true);
    setSelected(null);
    setHovered(null);
    setError(null);

    fetch(`/data/${cityKey}.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — run: python generate_mock.py --all`);
        return r.json();
      })
      .then(data => {
        setBuildings(data.features as BuildingFeature[]);
        setMeta({
          ghi_annual: data.irradiance?.ghi_annual_kwh_m2,
          count: data.feature_count ?? data.features.length,
        });
        setLoading(false);
      })
      .catch(err => {
        setError(String(err.message));
        setLoading(false);
      });
  }, []);

  useEffect(() => { loadCity(DEFAULT_CITY); }, [loadCity]);

  const switchCity = useCallback((cityKey: string) => {
    if (cityKey === activeCityKey) return;
    setActiveCityKey(cityKey);
    setViewState({
      ...CITIES[cityKey].view,
      transitionInterpolator: new FlyToInterpolator({ speed: 2.0 }),
      transitionDuration: 'auto',
    });
    loadCity(cityKey);
  }, [activeCityKey, loadCity]);

  const handleHover = useCallback((b: BuildingFeature | null, x: number, y: number) => {
    setHovered(b);
    if (b) setPointer({ x, y });
  }, []);

  if (error) {
    return (
      <div className="error-screen">
        <div className="error-title">Failed to load city data</div>
        <div className="error-msg">{error}</div>
        <pre className="error-cmd">
          cd data{'\n'}
          python generate_mock.py --all{'\n'}
          cp cities/*.json ../apps/web/public/data/
        </pre>
      </div>
    );
  }

  const city = CITIES[activeCityKey];

  return (
    <div className="app">
      {/* Full-viewport 3D scene */}
      <CityViewer
        buildings={buildings}
        activeMetric={metric}
        viewState={viewState}
        onViewStateChange={setViewState}
        onBuildingClick={b => { setSelected(b); setHovered(null); }}
        onBuildingHover={handleHover}
      />

      {/* Top-left toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <span className="city-name">
            {city.label}
            {loading && <span className="loading-dot" />}
          </span>
          {!loading && (
            <div className="toolbar-meta">
              {meta.count.toLocaleString()} buildings
              {meta.ghi_annual && (
                <span className="ghi-badge">
                  ☀ {meta.ghi_annual.toLocaleString()} kWh/m²/yr
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Metric selector cards — top right */}
      <MetricCards
        activeMetric={metric}
        onSelect={m => { setMetric(m); setSelected(null); }}
        buildings={buildings}
      />

      {/* City switcher — bottom centre */}
      <CityPicker
        activeCityKey={activeCityKey}
        onSelect={switchCity}
        loading={loading}
      />

      {/* Colour legend — bottom left */}
      <Legend activeMetric={metric} />

      {/* Hover tooltip — follows cursor */}
      {hovered && !selected && (
        <Tooltip
          building={hovered}
          x={pointer.x}
          y={pointer.y}
          activeMetric={metric}
        />
      )}

      {/* Click-to-inspect panel */}
      {selected && (
        <BuildingPanel building={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
