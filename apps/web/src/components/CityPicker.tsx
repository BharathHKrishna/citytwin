import { CITIES } from '../types';

const FLAG: Record<string, string> = { DE: '🇩🇪', IN: '🇮🇳', NL: '🇳🇱' };

interface Props {
  activeCityKey: string;
  onSelect: (cityKey: string) => void;
  loading: boolean;
}

export default function CityPicker({ activeCityKey, onSelect, loading }: Props) {
  return (
    <div className="city-picker">
      {Object.values(CITIES).map(city => (
        <button
          key={city.key}
          className={`city-btn${activeCityKey === city.key ? ' city-btn--active' : ''}`}
          onClick={() => onSelect(city.key)}
          disabled={loading}
        >
          <span className="city-btn-flag">{FLAG[city.country] ?? '🌍'}</span>
          <span className="city-btn-label">{city.label}</span>
        </button>
      ))}
    </div>
  );
}
