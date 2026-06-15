import { useState, useEffect, useCallback } from 'react';
import { FlyToInterpolator } from '@deck.gl/core';
import CityViewer from './components/CityViewer';
import BuildingPanel from './components/BuildingPanel';
import Legend from './components/Legend';
import CitySearch, { SearchTarget } from './components/CitySearch';
import MetricCards from './components/MetricCards';
import Tooltip from './components/Tooltip';
import HistoryStrip, { saveToHistory } from './components/HistoryStrip';
import { BuildingFeature, CityConfig, CityManifest, MetricKey } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ViewState = any;

const EARTH_VIEW: ViewState = {
  longitude: 20,
  latitude:  20,
  zoom:      2,
  pitch:     0,
  bearing:   0,
};

function cityViewState(city: CityConfig): ViewState {
  return {
    longitude: city.lon,
    latitude:  city.lat,
    zoom:      13.5,
    pitch:     60,
    bearing:   city.bearing ?? -15,
  };
}

function cityConfigFromGeoJSON(fc: Record<string, unknown>): CityConfig {
  const center = (fc.center ?? {}) as Record<string, number>;
  const irr    = (fc.irradiance ?? {}) as Record<string, number>;
  return {
    key:           fc.city as string,
    label:         fc.label as string,
    country:       fc.country as string,
    lat:           center.lat,
    lon:           center.lon,
    bearing:       center.bearing ?? -15,
    ghi_annual:    irr.ghi_annual_kwh_m2 ?? 0,
    feature_count: fc.feature_count as number,
  };
}

export default function App() {
  const [cities,     setCities]     = useState<CityConfig[]>([]);
  const [activeCity, setActiveCity] = useState<CityConfig | null>(null);
  const [buildings,  setBuildings]  = useState<BuildingFeature[]>([]);
  const [ghiAnnual,  setGhiAnnual]  = useState<number | null>(null);
  const [count,      setCount]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [viewState,  setViewState]  = useState<ViewState>(EARTH_VIEW);
  const [selected,   setSelected]   = useState<BuildingFeature | null>(null);
  const [metric,     setMetric]     = useState<MetricKey>('solar_potential');
  const [hovered,    setHovered]    = useState<BuildingFeature | null>(null);
  const [pointer,    setPointer]    = useState({ x: 0, y: 0 });

  // Load manifest — populates city list, does NOT auto-fly anywhere
  useEffect(() => {
    fetch('/data/manifest.json')
      .then(r => r.json())
      .then((m: CityManifest) => {
        setCities(m.cities);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setError('manifest.json not found');
      });
  }, []);

  const applyGeoJSON = useCallback((fc: Record<string, unknown>, city: CityConfig) => {
    setActiveCity(city);
    setBuildings((fc.features as BuildingFeature[]) ?? []);
    setGhiAnnual((fc.irradiance as Record<string, number>)?.ghi_annual_kwh_m2 ?? null);
    setCount((fc.feature_count as number) ?? 0);
    setViewState({
      ...cityViewState(city),
      transitionInterpolator: new FlyToInterpolator({ speed: 1.8 }),
      transitionDuration: 'auto',
    });
    setLoading(false);
    setError(null);
    saveToHistory(city);
  }, []);

  const loadCity = useCallback((city: CityConfig) => {
    setLoading(true);
    setSelected(null);
    setHovered(null);
    setError(null);

    fetch(`/data/${city.key}.json`)
      .then(r => {
        if (!r.ok) throw new Error(`No data for "${city.label}"`);
        return r.json();
      })
      .then((fc: Record<string, unknown>) => applyGeoJSON(fc, city))
      .catch(err => {
        setError(String(err.message));
        setLoading(false);
      });
  }, [applyGeoJSON]);

  // Always navigate — even if clicking the same city again (re-flies to it)
  const switchCity = useCallback((city: CityConfig) => {
    loadCity(city);
  }, [loadCity]);

  // Called when user picks a Photon suggestion — lat/lon already known
  const searchCity = useCallback(async (target: SearchTarget) => {
    setLoading(true);
    setSelected(null);
    setHovered(null);
    setError(null);

    const params = new URLSearchParams({
      query:   target.label,
      lat:     String(target.lat),
      lon:     String(target.lon),
      label:   target.label,
      country: target.country,
      radius:  '1.5',
    });
    const r = await fetch(`/api/city?${params}`);
    if (!r.ok) {
      const body = await r.json().catch(() => ({ detail: r.statusText }));
      setLoading(false);
      throw new Error(body.detail ?? `HTTP ${r.status}`);
    }

    const fc = await r.json() as Record<string, unknown>;
    const city = cityConfigFromGeoJSON(fc);

    setCities(prev => {
      const exists = prev.some(c => c.key === city.key);
      return exists ? prev.map(c => c.key === city.key ? city : c) : [...prev, city];
    });

    applyGeoJSON(fc, city);
  }, [applyGeoJSON]);

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

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <CitySearch
            cities={cities}
            activeCity={activeCity}
            onSelect={switchCity}
            onSearch={searchCity}
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
          {error && <div className="toolbar-error">{error}</div>}
        </div>
      </div>

      {/* History strip — always visible, separate from search dropdown */}
      <HistoryStrip activeCity={activeCity} onSelect={switchCity} />

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
