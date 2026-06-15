import { useState, useRef, useEffect } from 'react';
import { CityConfig } from '../types';

const FLAG: Record<string, string> = {
  DE: '🇩🇪', IN: '🇮🇳', NL: '🇳🇱', GB: '🇬🇧', FR: '🇫🇷',
  US: '🇺🇸', AU: '🇦🇺', JP: '🇯🇵', CN: '🇨🇳', BR: '🇧🇷',
  ZA: '🇿🇦', SG: '🇸🇬', AE: '🇦🇪', IT: '🇮🇹', ES: '🇪🇸',
  CA: '🇨🇦', NG: '🇳🇬', KE: '🇰🇪', MX: '🇲🇽', KR: '🇰🇷',
  TR: '🇹🇷', PK: '🇵🇰', BD: '🇧🇩', ID: '🇮🇩', TH: '🇹🇭',
  VN: '🇻🇳', PH: '🇵🇭', MY: '🇲🇾', EG: '🇪🇬', MA: '🇲🇦',
  ET: '🇪🇹', GH: '🇬🇭', TZ: '🇹🇿', AR: '🇦🇷', CO: '🇨🇴',
  CL: '🇨🇱', PE: '🇵🇪', UA: '🇺🇦', PL: '🇵🇱', RO: '🇷🇴',
  PT: '🇵🇹', SE: '🇸🇪', NO: '🇳🇴', FI: '🇫🇮', DK: '🇩🇰',
  CH: '🇨🇭', AT: '🇦🇹', BE: '🇧🇪', RU: '🇷🇺', IR: '🇮🇷',
};

export interface SearchTarget {
  label:   string;
  country: string;
  lat:     number;
  lon:     number;
}

// Photon (komoot) feature — purpose-built geocoder autocomplete on OSM data.
// Handles prefix matching properly: "hambur" → Hamburg, "stutt" → Stuttgart.
interface PhotonFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] }; // [lon, lat]
  properties: {
    osm_id:      number;
    name:        string;
    country:     string;
    countrycode: string;
    type:        string; // 'city', 'town', 'village', 'county', 'district'
    state?:      string;
    county?:     string;
  };
}

interface Props {
  cities:     CityConfig[];
  activeCity: CityConfig | null;
  onSelect:   (city: CityConfig) => void;
  onSearch:   (target: SearchTarget) => Promise<void>;
  loading:    boolean;
}

export default function CitySearch({ cities, activeCity, onSelect, onSearch, loading }: Props) {
  const [query,       setQuery]       = useState('');
  const [open,        setOpen]        = useState(false);
  const [suggestions, setSuggestions] = useState<PhotonFeature[]>([]);
  const [nomLoading,  setNomLoading]  = useState(false);
  const [searching,   setSearching]   = useState(false);
  const [searchErr,   setSearchErr]   = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const trimmed = query.trim();
  const lower   = trimmed.toLowerCase();

  const knownMatches = trimmed.length === 0
    ? []
    : cities.filter(c =>
        c.label.toLowerCase().includes(lower) ||
        c.key.toLowerCase().includes(lower),
      );

  // Photon autocomplete — debounced 380ms.
  // Uses layer=city,district,county for settlement-level results only.
  // Photon does proper prefix matching so "hambur" → Hamburg, "stutt" → Stuttgart.
  useEffect(() => {
    if (trimmed.length < 2) { setSuggestions([]); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setNomLoading(true);
      try {
        const url =
          `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}` +
          `&limit=7&layer=city,district,county`;
        const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        const data = await r.json() as { features: PhotonFeature[] };
        setSuggestions(data.features ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setNomLoading(false);
      }
    }, 380);
    return () => clearTimeout(debounce.current);
  }, [trimmed]);

  function selectKnown(city: CityConfig) {
    onSelect(city);
    setQuery('');
    setOpen(false);
    setSuggestions([]);
    setSearchErr(null);
    inputRef.current?.blur();
  }

  async function selectSuggestion(f: PhotonFeature) {
    const [lon, lat] = f.geometry.coordinates;
    const target: SearchTarget = {
      label:   f.properties.name,
      country: (f.properties.countrycode ?? '').toUpperCase(),
      lat,
      lon,
    };
    setQuery('');
    setOpen(false);
    setSuggestions([]);
    setSearchErr(null);
    setSearching(true);
    inputRef.current?.blur();
    try {
      await onSearch(target);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Distinguish "no local API" from other errors
      setSearchErr(
        msg.includes('Failed to fetch') || msg.includes('404')
          ? `Live search needs the local API server — run: cd apps/api && uvicorn server:app --port 8000`
          : msg,
      );
    } finally {
      setSearching(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      setSuggestions([]);
      inputRef.current?.blur();
    }
  }

  const busy    = loading || searching;
  const showNom = suggestions.length > 0 && !busy;
  const hasAny  = knownMatches.length > 0 || showNom || !!searchErr;

  return (
    <div className="city-search">
      <div className="city-search-bar">
        <span className="city-search-icon">⌖</span>
        <input
          ref={inputRef}
          className="city-search-input"
          type="text"
          placeholder={activeCity ? activeCity.label : 'Search any city…'}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setSearchErr(null); }}
          onFocus={() => { if (trimmed.length >= 2) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onKeyDown={handleKeyDown}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
        />
        {(busy || nomLoading) && <span className="loading-dot" />}
      </div>

      {open && hasAny && (
        <div className="city-search-dropdown">

          {/* Already-fetched cities that match the query */}
          {knownMatches.length > 0 && (
            <>
              <div className="city-search-section">Already fetched</div>
              {knownMatches.map(city => (
                <button
                  key={city.key}
                  className={`city-search-item${city.key === activeCity?.key ? ' city-search-item--active' : ''}`}
                  onMouseDown={() => selectKnown(city)}
                >
                  <span className="city-search-flag">{FLAG[city.country] ?? '🌍'}</span>
                  <span className="city-search-label">{city.label}</span>
                  {city.ghi_annual > 0 && (
                    <span className="city-search-ghi">☀ {city.ghi_annual.toLocaleString()} kWh/m²/yr</span>
                  )}
                </button>
              ))}
            </>
          )}

          {/* Photon live suggestions */}
          {showNom && (
            <>
              <div className="city-search-section">
                {knownMatches.length > 0 ? 'Or fetch a new city' : 'Select the right one'}
              </div>
              {suggestions.map(f => {
                const cc = (f.properties.countrycode ?? '').toUpperCase();
                const ctx = [f.properties.state, f.properties.country].filter(Boolean).join(', ');
                return (
                  <button
                    key={f.properties.osm_id}
                    className="city-search-item city-search-item--nom"
                    onMouseDown={() => selectSuggestion(f)}
                  >
                    <span className="city-search-flag">{FLAG[cc] ?? '🌍'}</span>
                    <span className="city-search-label-wrap">
                      <span className="city-search-label">{f.properties.name}</span>
                      {ctx && <span className="city-search-context">{ctx}</span>}
                    </span>
                    <span className="city-search-ghi">~20 s</span>
                  </button>
                );
              })}
            </>
          )}

          {searchErr && (
            <div className="city-search-err">
              <span>⚠</span>
              <span>{searchErr}</span>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
