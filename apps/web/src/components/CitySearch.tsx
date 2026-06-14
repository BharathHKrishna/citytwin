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
  loading: boolean;
}

export default function CitySearch({ cities, activeCity, onSelect, loading }: Props) {
  const [query, setQuery]   = useState('');
  const [open, setOpen]     = useState(false);
  const inputRef            = useRef<HTMLInputElement>(null);

  const filtered = query.trim().length === 0
    ? cities
    : cities.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.key.toLowerCase().includes(query.toLowerCase()),
      );

  function select(city: CityConfig) {
    onSelect(city);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div className="city-search">
      <div className="city-search-bar">
        <span className="city-search-icon">⌖</span>
        <input
          ref={inputRef}
          className="city-search-input"
          type="text"
          placeholder={activeCity ? activeCity.label : 'Search city…'}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          disabled={loading}
          spellCheck={false}
          autoComplete="off"
        />
        {loading && <span className="loading-dot" />}
      </div>

      {open && filtered.length > 0 && (
        <div className="city-search-dropdown">
          {filtered.map(city => (
            <button
              key={city.key}
              className={`city-search-item${city.key === activeCity?.key ? ' city-search-item--active' : ''}`}
              onMouseDown={() => select(city)}   // mousedown fires before input blur
            >
              <span className="city-search-flag">
                {FLAG[city.country] ?? '🌍'}
              </span>
              <span className="city-search-label">{city.label}</span>
              {city.ghi_annual > 0 && (
                <span className="city-search-ghi">
                  ☀ {city.ghi_annual.toLocaleString()} kWh/m²/yr
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
