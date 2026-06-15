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
  name:         string;          // OSM name tag — the canonical place name
  display_name: string;
  lat:          string;
  lon:          string;
  class:        string;
  type:         string;
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

function hitPrimaryName(h: NominatimHit): string {
  // h.name is the raw OSM name — most reliable for matching.
  // Fall back to address fields, then first word of display_name.
  if (h.name) return h.name;
  const a = h.address;
  return a.city ?? a.town ?? a.municipality ?? a.village ?? h.display_name.split(',')[0].trim();
}

function hitContext(h: NominatimHit): string {
  return [h.address.state, h.address.country].filter(Boolean).join(', ');
}

function hitFlag(h: NominatimHit): string {
  return FLAG[(h.address.country_code ?? '').toUpperCase()] ?? '🌍';
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

  // Nominatim autocomplete, debounced 400ms.
  // Key filter: h.name (OSM canonical name) must start with or contain the query.
  // This blocks false positives: "Mora" appearing for "stutt" happens because
  // Mora has a "Stuttgarterstraße", but Mora's OSM name is "Mora" ≠ "stutt".
  // Hamburg, Stuttgart, Kolkata etc. all pass because their OSM names match.
  useEffect(() => {
    if (trimmed.length < 2) { setSuggestions([]); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setNomLoading(true);
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search` +
          `?q=${encodeURIComponent(trimmed)}&format=json&limit=15&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } },
        );
        const data: NominatimHit[] = await r.json();

        const hits = data.filter(h => {
          // Only settlements and admin boundaries — skip roads, POIs, etc.
          if (h.class !== 'place' && !(h.class === 'boundary' && h.type === 'administrative')) {
            return false;
          }
          // OSM name must actually contain the typed string.
          // This is the key fix: uses h.name (raw OSM tag), not display_name.
          const name = hitPrimaryName(h).toLowerCase();
          return name.includes(lower);
        });

        setSuggestions(hits.slice(0, 6));
      } catch {
        setSuggestions([]);
      } finally {
        setNomLoading(false);
      }
    }, 400);
    return () => clearTimeout(debounce.current);
  }, [trimmed, lower]);

  function selectKnown(city: CityConfig) {
    onSelect(city);
    setQuery('');
    setOpen(false);
    setSuggestions([]);
    setSearchErr(null);
    inputRef.current?.blur();
  }

  async function selectSuggestion(hit: NominatimHit) {
    const target: SearchTarget = {
      label:   hitPrimaryName(hit),
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSearchErr(
        msg.includes('Failed to fetch') || msg.includes('404')
          ? 'Live fetch needs the local API — run: cd apps/api && uvicorn server:app --port 8000'
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
          onFocus={() => setOpen(true)}
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

          {knownMatches.length > 0 && (
            <>
              <div className="city-search-section">Already fetched</div>
              {knownMatches.map(city => (
                <button
                  key={city.key}
                  className={`city-search-item${city.key === activeCity?.key ? ' city-search-item--active' : ''}`}
                  onMouseDown={() => selectKnown(city)}
                >
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
              {suggestions.map(hit => (
                <button
                  key={hit.place_id}
                  className="city-search-item city-search-item--nom"
                  onMouseDown={() => selectSuggestion(hit)}
                >
                  <span className="city-search-flag">{hitFlag(hit)}</span>
                  <span className="city-search-label-wrap">
                    <span className="city-search-label">{hitPrimaryName(hit)}</span>
                    <span className="city-search-context">{hitContext(hit)}</span>
                  </span>
                  <span className="city-search-ghi">~20 s</span>
                </button>
              ))}
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
