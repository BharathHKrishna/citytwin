import { useState, useRef } from 'react';
import { CityConfig } from '../types';

const FLAG: Record<string, string> = {
  DE: '🇩🇪', IN: '🇮🇳', NL: '🇳🇱', GB: '🇬🇧', FR: '🇫🇷',
  US: '🇺🇸', AU: '🇦🇺', JP: '🇯🇵', CN: '🇨🇳', BR: '🇧🇷',
  ZA: '🇿🇦', SG: '🇸🇬', AE: '🇦🇪', IT: '🇮🇹', ES: '🇪🇸',
  CA: '🇨🇦', NG: '🇳🇬', KE: '🇰🇪', MX: '🇲🇽', KR: '🇰🇷',
};

interface Props {
  cities: CityConfig[];
  activeCity: CityConfig | null;
  onSelect: (city: CityConfig) => void;
  onSearch: (query: string) => Promise<void>;
  loading: boolean;
}

export default function CitySearch({ cities, activeCity, onSelect, onSearch, loading }: Props) {
  const [query,      setQuery]      = useState('');
  const [open,       setOpen]       = useState(false);
  const [searching,  setSearching]  = useState(false);
  const [searchErr,  setSearchErr]  = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();

  const filtered = trimmed.length === 0
    ? cities
    : cities.filter(c =>
        c.label.toLowerCase().includes(trimmed.toLowerCase()) ||
        c.key.toLowerCase().includes(trimmed.toLowerCase()),
      );

  // Show "search worldwide" option when typed text doesn't match known cities
  const showWorldwide = trimmed.length >= 2 && !loading && !searching;

  function select(city: CityConfig) {
    onSelect(city);
    setQuery('');
    setOpen(false);
    setSearchErr(null);
    inputRef.current?.blur();
  }

  async function triggerWorldwideSearch() {
    if (!trimmed) return;
    setSearching(true);
    setSearchErr(null);
    setOpen(false);
    inputRef.current?.blur();
    try {
      await onSearch(trimmed);
      setQuery('');
    } catch (e: unknown) {
      setSearchErr(e instanceof Error ? e.message : String(e));
      setOpen(true);
    } finally {
      setSearching(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && trimmed.length >= 2 && filtered.length === 0) {
      triggerWorldwideSearch();
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    }
  }

  const busy = loading || searching;

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
        {busy && <span className="loading-dot" />}
      </div>

      {open && (filtered.length > 0 || showWorldwide || searchErr) && (
        <div className="city-search-dropdown">
          {filtered.map(city => (
            <button
              key={city.key}
              className={`city-search-item${city.key === activeCity?.key ? ' city-search-item--active' : ''}`}
              onMouseDown={() => select(city)}
            >
              <span className="city-search-flag">{FLAG[city.country] ?? '🌍'}</span>
              <span className="city-search-label">{city.label}</span>
              {city.ghi_annual > 0 && (
                <span className="city-search-ghi">☀ {city.ghi_annual.toLocaleString()} kWh/m²/yr</span>
              )}
            </button>
          ))}

          {showWorldwide && (
            <button
              className="city-search-item city-search-item--worldwide"
              onMouseDown={triggerWorldwideSearch}
            >
              <span className="city-search-flag">🔍</span>
              <span className="city-search-label">
                {filtered.length === 0
                  ? `Fetch "${trimmed}" from OSM`
                  : `Search worldwide for "${trimmed}"`}
              </span>
              <span className="city-search-ghi">~20 s</span>
            </button>
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
