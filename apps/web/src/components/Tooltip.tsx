import { BuildingFeature, MetricKey, METRIC_CONFIG } from '../types';

function mwh(kwh: number): string {
  return kwh >= 1000 ? `${(kwh / 1000).toFixed(1)} MWh` : `${Math.round(kwh)} kWh`;
}

interface Props {
  building: BuildingFeature;
  x: number;
  y: number;
  activeMetric: MetricKey;
}

export default function Tooltip({ building, x, y, activeMetric }: Props) {
  const p = building.properties;
  const cfg = METRIC_CONFIG[activeMetric];

  // Flip tooltip to left if too close to right edge
  const leftAligned = x < window.innerWidth - 200;

  const metricValue = activeMetric === 'height'
    ? `${p.height.toFixed(1)} m`
    : activeMetric === 'solar_potential'
      ? mwh(p.solar_kwh_year) + '/yr'
      : mwh(p.heat_kwh_year) + '/yr';

  return (
    <div
      className="tooltip"
      style={{
        left:  leftAligned ? x + 14 : undefined,
        right: leftAligned ? undefined : window.innerWidth - x + 14,
        top:   y - 8,
      }}
    >
      <div className="tooltip-type">{p.building_type}</div>
      <div className="tooltip-row">
        <span className="tooltip-key">{p.height.toFixed(0)} m</span>
        <span className="tooltip-sep">·</span>
        <span className="tooltip-key">{p.levels} fl</span>
        <span className="tooltip-sep">·</span>
        <span className="tooltip-val">{cfg.icon} {metricValue}</span>
      </div>
    </div>
  );
}
