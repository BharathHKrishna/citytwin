import { BuildingFeature, MetricKey } from '../types';

// Blue → teal → yellow → red  (low energy → high energy feel)
const STOPS: [number, number, number][] = [
  [65,  182, 230],
  [44,  204, 150],
  [253, 221,  50],
  [220,  50,  30],
];

export function heatColor(t: number): [number, number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const seg = t * (STOPS.length - 1);
  const i = Math.min(Math.floor(seg), STOPS.length - 2);
  const f = seg - i;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
    210,
  ];
}

export function normalizedColor(
  value: number,
  min: number,
  max: number,
): [number, number, number, number] {
  const t = max > min ? (value - min) / (max - min) : 0;
  return heatColor(t);
}

export function getMetricRange(
  buildings: BuildingFeature[],
  metric: MetricKey,
): [number, number] {
  if (buildings.length === 0) return [0, 1];
  const values = buildings
    .map(b => b.properties[metric] as number)
    .filter(v => isFinite(v));
  return [Math.min(...values), Math.max(...values)];
}

// Returns evenly-spaced color stops for a CSS gradient / legend
export function getLegendStops(count = 6): Array<{ t: number; color: string }> {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const [r, g, b] = heatColor(t);
    return { t, color: `rgb(${r},${g},${b})` };
  });
}
