import { MetricKey, METRIC_CONFIG, BuildingFeature } from '../types';
import { heatColor } from '../lib/colorScales';

interface Props {
  activeMetric: MetricKey;
  onSelect: (metric: MetricKey) => void;
  buildings: BuildingFeature[];
}

function cityAvg(buildings: BuildingFeature[], metric: MetricKey): number {
  if (buildings.length === 0) return 0;
  const sum = buildings.reduce((acc, b) => acc + (b.properties[metric] as number), 0);
  return sum / buildings.length;
}

function formatAvg(avg: number, metric: MetricKey): string {
  if (metric === 'height') return `${avg.toFixed(1)} m avg`;
  return `${(avg * 100).toFixed(0)}% avg`;
}

// Tiny swatch showing the color at the metric's average normalised value
function Swatch({ value }: { value: number }) {
  const [r, g, b] = heatColor(value);
  return (
    <span
      className="metric-card-swatch"
      style={{ background: `rgb(${r},${g},${b})` }}
    />
  );
}

export default function MetricCards({ activeMetric, onSelect, buildings }: Props) {
  return (
    <div className="metric-cards">
      {(Object.keys(METRIC_CONFIG) as MetricKey[]).map(key => {
        const cfg = METRIC_CONFIG[key];
        const avg = cityAvg(buildings, key);
        const isActive = key === activeMetric;

        return (
          <button
            key={key}
            className={`metric-card${isActive ? ' metric-card--active' : ''}`}
            onClick={() => onSelect(key)}
          >
            <div className="metric-card-top">
              <span className="metric-card-icon">{cfg.icon}</span>
              <Swatch value={avg} />
            </div>
            <div className="metric-card-label">{cfg.label}</div>
            <div className="metric-card-sub">{formatAvg(avg, key)}</div>
          </button>
        );
      })}
    </div>
  );
}
