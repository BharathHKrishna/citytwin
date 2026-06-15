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

interface Suggestion {
  id:      string;
  name:    string;
  context: string;   // "State, Country"
  cc:      string;   // ISO country code
  lat:     number;
  lon:     number;
}

// Photon (komoot.io) — purpose-built autocomplete on OSM data.
// Handles partial cross-word queries: "san fra" → San Francisco, "hambur" → Hamburg.
// Falls back to Nominatim importance-ranked search if Photon is unreachable.
async function fetchSuggestions(q: string): Promise<Suggestion[]> {
  // ── Primary: Photon ────────────────────────────────────────────────────────
  try {
    const r = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=7&lang=en&layer=city,district,county`,
      { signal: AbortSignal.timeout(5000) },
    );
    const data = await r.json() as { features: unknown[] };
    interface PF { geometry: { coordinates: [number, number] }; properties: Record<string, string> }
    const features = data.features as PF[];
    if (features.length > 0) {
      return features.map((f, i) => {
        const p  = f.properties;
        const ctx = [p.state, p.country].filter(Boolean).join(', ');
        return {
          id:      String(p.osm_id ?? i),
          name:    p.name ?? '',
          context: ctx,
          cc:      (p.countrycode ?? '').toUpperCase(),
          lat:     f.geometry.coordinates[1],
          lon:     f.geometry.coordinates[0],
        };
      }).filter(s => s.name.toLowerCase().includes(q.trim().toLowerCase().split(/\s+/)[0]));
    }
  } catch { /* Photon unreachable — fall through to Nominatim */ }

  // ── Fallback: Nominatim with importance sort ───────────────────────────────
  interface NH {
    place_id: number; display_name: string; lat: string; lon: string;
    class: string; type: string; importance: number;
    address: Record<string, string>;
  }
  const r2 = await fetch(
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(q)}&format=json&limit=15&addressdetails=1`,
    { headers: { 'Accept-Language': 'en' }, signal: AbortSignal.timeout(6000) },
  );
  const hits: NH[] = await r2.json();
  const lower = q.trim().toLowerCase();
  return hits
    .filter(h => {
      if (h.class !== 'place' && !(h.class === 'boundary' && h.type === 'administrative')) return false;
      return h.display_name.split(',')[0].trim().toLowerCase().includes(lower);
    })
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .slice(0, 6)
    .map(h => {
      const a = h.address;
      return {
        id:      String(h.place_id),
        name:    h.display_name.split(',')[0].trim(),
        context: [a.state, a.country].filter(Boolean).join(', '),
        cc:      (a.country_code ?? '').toUpperCase(),
        lat:     parseFloat(h.lat),
        lon:     parseFloat(h.lon),
      };
    });
}

interface Props {
  cities:        CityConfig[];
  activeCity:    CityConfig | null;
  onSelect:      (city: CityConfig) => void;
  onSearch:      (target: SearchTarget) => Promise<void>;
  onClearError:  () => void;
  loading:       boolean;
}

export default function CitySearch({ cities, activeCity, onSelect, onSearch, onClearError, loading }: Props) {
  const [query,       setQuery]       = useState('');
  const [open,        setOpen]        = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [fetching,    setFetching]    = useState(false);
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

  useEffect(() => {
    if (trimmed.length < 2) { setSuggestions([]); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setFetching(true);
      try {
        setSuggestions(await fetchSuggestions(trimmed));
      } catch {
        setSuggestions([]);
      } finally {
        setFetching(false);
      }
    }, 350);
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

  async function selectSuggestion(s: Suggestion) {
    const target: SearchTarget = { label: s.name, country: s.cc, lat: s.lat, lon: s.lon };
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
      setSearchErr(
        msg.includes('Failed to fetch') || msg.includes('404')
          ? 'Need local API: cd apps/api && uvicorn server:app --port 8000'
          : msg,
      );
    } finally {
      setSearching(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false); setQuery(''); setSuggestions([]); inputRef.current?.blur();
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
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
            setSearchErr(null);
            onClearError();   // clear any toolbar error when user types
          }}
          onFocus={() => { setOpen(true); setSearchErr(null); }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onKeyDown={handleKeyDown}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
        />
        {(busy || fetching) && <span className="loading-dot" />}
      </div>

      {open && hasAny && (
        <div className="city-search-dropdown">
          {knownMatches.length > 0 && (
            <>
              <div className="city-search-section">Already fetched</div>
              {knownMatches.map(city => (
                <button key={city.key}
                  className={`city-search-item${city.key === activeCity?.key ? ' city-search-item--active' : ''}`}
                  onMouseDown={() => selectKnown(city)}>
                  <span className="city-search-flag">{FLAG[city.country?.toUpperCase()] ?? '🌍'}</span>
                  <span className="city-search-label">{city.label}</span>
                  {city.ghi_annual > 0 && (
                    <span className="city-search-ghi">☀ {city.ghi_annual.toLocaleString()} kWh/m²/yr</span>
                  )}
                </button>
              ))}
            </>
          )}

          {showNom && (
            <>
              <div className="city-search-section">
                {knownMatches.length > 0 ? 'Or fetch a new city' : 'Select the right one'}
              </div>
              {suggestions.map(s => (
                <button key={s.id}
                  className="city-search-item city-search-item--nom"
                  onMouseDown={() => selectSuggestion(s)}>
                  <span className="city-search-flag">{FLAG[s.cc] ?? '🌍'}</span>
                  <span className="city-search-label-wrap">
                    <span className="city-search-label">{s.name}</span>
                    {s.context && <span className="city-search-context">{s.context}</span>}
                  </span>
                  <span className="city-search-ghi">~20 s</span>
                </button>
              ))}
            </>
          )}

          {searchErr && (
            <div className="city-search-err">
              <span>⚠</span><span>{searchErr}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
