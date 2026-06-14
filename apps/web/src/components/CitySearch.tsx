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

interface NominatimHit {
  place_id:     number;
  display_name: string;
  lat:          string;
  lon:          string;
  type:         string;
  class:        string;
  address: {
    city?:         string;
    town?:         string;
    village?:      string;
    municipality?: string;
    county?:       string;
    state?:        string;
    country?:      string;
    country_code?: string;
  };
}

function hitLabel(h: NominatimHit): string {
  const a = h.address;
  return (
    a.city ?? a.town ?? a.municipality ?? a.village ?? a.county ??
    h.display_name.split(',')[0].trim()
  );
}

function hitContext(h: NominatimHit): string {
  const a = h.address;
  return [a.state, a.country].filter(Boolean).join(', ');
}

function hitFlag(h: NominatimHit): string {
  return FLAG[(h.address.country_code ?? '').toUpperCase()] ?? '🌍';
}

const HISTORY_KEY = 'citytwin_history';

function loadHistory(): CityConfig[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); }
  catch { return []; }
}

function saveToHistory(city: CityConfig) {
  const prev = loadHistory().filter(c => c.key !== city.key);
  localStorage.setItem(HISTORY_KEY, JSON.stringify([city, ...prev].slice(0, 10)));
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
  const [suggestions, setSuggestions] = useState<NominatimHit[]>([]);
  const [nomLoading,  setNomLoading]  = useState(false);
  const [searching,   setSearching]   = useState(false);
  const [searchErr,   setSearchErr]   = useState<string | null>(null);
  const [history,     setHistory]     = useState<CityConfig[]>(loadHistory);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const trimmed = query.trim();
  const lower   = trimmed.toLowerCase();

  const knownMatches = trimmed.length === 0
    ? cities
    : cities.filter(c =>
        c.label.toLowerCase().includes(lower) ||
        c.key.toLowerCase().includes(lower),
      );

  // Nominatim autocomplete — debounced, filtered so city name must match query
  useEffect(() => {
    if (trimmed.length < 2) { setSuggestions([]); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setNomLoading(true);
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?` +
          `q=${encodeURIComponent(trimmed)}&format=json&limit=10&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } },
        );
        const data: NominatimHit[] = await r.json();

        // Only keep settlement / admin results where the CITY NAME contains the query.
        // This blocks results like "Mora" appearing for "stutt" (Mora just has a
        // street named after Stuttgart — the city name itself doesn't match).
        const hits = data.filter(h => {
          if (h.class !== 'place' && !(h.class === 'boundary' && h.type === 'administrative')) {
            return false;
          }
          const name = hitLabel(h).toLowerCase();
          return name.includes(lower);
        });

        setSuggestions(hits.slice(0, 6));
      } catch {
        setSuggestions([]);
      } finally {
        setNomLoading(false);
      }
    }, 380);
    return () => clearTimeout(debounce.current);
  }, [trimmed, lower]);

  function selectKnown(city: CityConfig) {
    saveToHistory(city);
    setHistory(loadHistory());
    onSelect(city);
    setQuery('');
    setOpen(false);
    setSuggestions([]);
    setSearchErr(null);
    inputRef.current?.blur();
  }

  async function selectSuggestion(hit: NominatimHit) {
    const target: SearchTarget = {
      label:   hitLabel(hit),
      country: (hit.address.country_code ?? '').toUpperCase(),
      lat:     parseFloat(hit.lat),
      lon:     parseFloat(hit.lon),
    };
    setQuery('');
    setOpen(false);
    setSuggestions([]);
    setSearchErr(null);
    setSearching(true);
    inputRef.current?.blur();
    try {
      await onSearch(target);
      // History is updated in App after city loads successfully
      setHistory(loadHistory());
    } catch (e: unknown) {
      setSearchErr(e instanceof Error ? e.message : String(e));
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

  const busy     = loading || searching;
  const showNom  = suggestions.length > 0 && !busy;
  const recentCities = history.filter(h => h.key !== activeCity?.key);

  // What to show when query is empty: recent history, then all known cities
  const emptyKnown = trimmed.length === 0 ? cities.filter(c => c.key !== activeCity?.key) : [];

  const hasContent =
    knownMatches.length > 0 ||
    showNom ||
    searchErr ||
    (trimmed.length === 0 && (recentCities.length > 0 || emptyKnown.length > 0));

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
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onKeyDown={handleKeyDown}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
        />
        {(busy || nomLoading) && <span className="loading-dot" />}
      </div>

      {open && hasContent && (
        <div className="city-search-dropdown">

          {/* Empty query: show history + all cities */}
          {trimmed.length === 0 && (
            <>
              {recentCities.length > 0 && (
                <>
                  <div className="city-search-section">Recent</div>
                  {recentCities.map(city => (
                    <button
                      key={city.key}
                      className="city-search-item"
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
              {emptyKnown.length > 0 && (
                <>
                  <div className="city-search-section">All cities</div>
                  {emptyKnown.map(city => (
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
            </>
          )}

          {/* Non-empty query: matching known cities */}
          {trimmed.length > 0 && knownMatches.length > 0 && (
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

          {/* Nominatim suggestions */}
          {showNom && (
            <>
              <div className="city-search-section">
                {knownMatches.length > 0 ? 'More cities' : 'Select the right one'}
              </div>
              {suggestions.map(hit => (
                <button
                  key={hit.place_id}
                  className="city-search-item city-search-item--nom"
                  onMouseDown={() => selectSuggestion(hit)}
                >
                  <span className="city-search-flag">{hitFlag(hit)}</span>
                  <span className="city-search-label-wrap">
                    <span className="city-search-label">{hitLabel(hit)}</span>
                    <span className="city-search-context">{hitContext(hit)}</span>
                  </span>
                  <span className="city-search-ghi">~20 s</span>
                </button>
              ))}
            </>
          )}

          {searchErr && (
            <div className="city-search-item" style={{ color: '#e05252', cursor: 'default' }}>
              <span className="city-search-flag">⚠</span>
              <span className="city-search-label" style={{ fontSize: 11 }}>{searchErr}</span>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
