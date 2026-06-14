import { MetricKey, METRIC_CONFIG } from '../types';
import { getLegendStops } from '../lib/colorScales';

interface Props {
  activeMetric: MetricKey;
}

const STOPS = getLegendStops(8);
const GRADIENT = `linear-gradient(to right, ${STOPS.map(s => s.color).join(', ')})`;

export default function Legend({ activeMetric }: Props) {
  const { label, lowLabel, highLabel } = METRIC_CONFIG[activeMetric];

  return (
    <div className="legend">
      <div className="legend-title">{label}</div>
      <div className="legend-bar" style={{ background: GRADIENT }} />
      <div className="legend-labels">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
      <div className="legend-note">indicative estimates</div>
    </div>
  );
}
