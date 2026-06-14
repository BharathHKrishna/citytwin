export interface BuildingProperties {
  height: number;
  levels: number;
  footprint_area: number;
  volume: number;
  // Normalised 0–1 for coloring
  solar_potential: number;
  heat_demand_proxy: number;
  // Actual energy estimates from real GHI (Global Solar Atlas)
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

export interface CityConfig {
  key: string;
  label: string;
  country: string;
  view: {
    longitude: number;
    latitude: number;
    zoom: number;
    pitch: number;
    bearing: number;
  };
  ghi_annual?: number;   // populated from GeoJSON metadata after load
}

export const CITIES: Record<string, CityConfig> = {
  karlsruhe: { key: 'karlsruhe', label: 'Karlsruhe', country: 'DE', view: { longitude: 8.4037,  latitude: 49.0069, zoom: 13.5, pitch: 60, bearing: -15 } },
  bangalore:  { key: 'bangalore',  label: 'Bangalore',  country: 'IN', view: { longitude: 77.5946, latitude: 12.9716, zoom: 13.5, pitch: 60, bearing: -20 } },
  berlin:     { key: 'berlin',     label: 'Berlin',     country: 'DE', view: { longitude: 13.4050, latitude: 52.5200, zoom: 13.5, pitch: 60, bearing:  10 } },
  munich:     { key: 'munich',     label: 'Munich',     country: 'DE', view: { longitude: 11.5820, latitude: 48.1351, zoom: 13.5, pitch: 60, bearing:  -5 } },
  amsterdam:  { key: 'amsterdam',  label: 'Amsterdam',  country: 'NL', view: { longitude:  4.8952, latitude: 52.3702, zoom: 13.5, pitch: 60, bearing:  15 } },
};
