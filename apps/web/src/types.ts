export interface BuildingProperties {
  height: number;
  levels: number;
  footprint_area: number;
  volume: number;
  solar_potential: number;
  heat_demand_proxy: number;
  solar_kwh_year: number;
  heat_kwh_year: number;
  building_type: string;
}

export interface BuildingFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  properties: BuildingProperties;
}

export type MetricKey = 'height' | 'solar_potential' | 'heat_demand_proxy';

export interface MetricConfig {
  label: string;
  sublabel: string;
  lowLabel: string;
  highLabel: string;
  unit: string;
  icon: string;
}

export const METRIC_CONFIG: Record<MetricKey, MetricConfig> = {
  solar_potential: {
    label: 'Solar Potential',
    sublabel: 'Rooftop yield',
    lowLabel: 'Low',
    highLabel: 'High',
    unit: 'kWh/yr',
    icon: '☀',
  },
  heat_demand_proxy: {
    label: 'Heat Demand',
    sublabel: 'Est. annual loss',
    lowLabel: 'Low',
    highLabel: 'High',
    unit: 'kWh/yr',
    icon: '🔥',
  },
  height: {
    label: 'Building Height',
    sublabel: 'Metres above ground',
    lowLabel: 'Short',
    highLabel: 'Tall',
    unit: 'm',
    icon: '▲',
  },
};

// Loaded at runtime from /data/manifest.json — no hardcoded list
export interface CityConfig {
  key: string;
  label: string;
  country: string;
  lat: number;
  lon: number;
  bearing: number;
  ghi_annual: number;
  feature_count: number;
}

export interface CityManifest {
  cities: CityConfig[];
  updated: string;
}
