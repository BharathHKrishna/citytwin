import { useEffect, useState } from 'react';
import { CityConfig } from '../types';

const FLAG: Record<string, string> = {
  DE: '🇩🇪', IN: '🇮🇳', NL: '🇳🇱', GB: '🇬🇧', FR: '🇫🇷',
  US: '🇺🇸', AU: '🇦🇺', JP: '🇯🇵', CN: '🇨🇳', BR: '🇧🇷',
  ZA: '🇿🇦', SG: '🇸🇬', AE: '🇦🇪', IT: '🇮🇹', ES: '🇪🇸',
  CA: '🇨🇦', NG: '🇳🇬', KE: '🇰🇪', MX: '🇲🇽', KR: '🇰🇷',
  TR: '🇹🇷', PK: '🇵🇰', ID: '🇮🇩', TH: '🇹🇭', EG: '🇪🇬',
  AR: '🇦🇷', SE: '🇸🇪', NO: '🇳🇴', CH: '🇨🇭', AT: '🇦🇹',
  BE: '🇧🇪', PL: '🇵🇱', PT: '🇵🇹', UA: '🇺🇦', RU: '🇷🇺',
};

export const HISTORY_KEY = 'citytwin_history';

export function loadHistory(): CityConfig[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); }
  catch { return []; }
}

export function saveToHistory(city: CityConfig) {
  try {
    const prev = loadHistory().filter(c => c.key !== city.key);
    localStorage.setItem(HISTORY_KEY, JSON.stringify([city, ...prev].slice(0, 12)));
  } catch { /* ignore */ }
}

interface Props {
  activeCity: CityConfig | null;
  onSelect:   (city: CityConfig) => void;
}

export default function HistoryStrip({ activeCity, onSelect }: Props) {
  const [history, setHistory] = useState<CityConfig[]>(loadHistory);

  // Re-read history when activeCity changes (a new city was just visited)
  useEffect(() => {
    setHistory(loadHistory());
  }, [activeCity?.key]);

  if (history.length === 0) return null;

  return (
    <div className="history-strip">
      <span className="history-label">History</span>
      <div className="history-chips">
        {history.map(city => (
          <button
            key={city.key}
            className={`history-chip${city.key === activeCity?.key ? ' history-chip--active' : ''}`}
            onClick={() => onSelect(city)}
            title={`${city.label} — ☀ ${city.ghi_annual} kWh/m²/yr`}
          >
            <span className="history-chip-flag">{FLAG[city.country] ?? '🌍'}</span>
            {city.label}
          </button>
        ))}
      </div>
    </div>
  );
}
