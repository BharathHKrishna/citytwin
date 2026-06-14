import { useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer } from '@deck.gl/layers';
import { LightingEffect, AmbientLight, DirectionalLight } from '@deck.gl/core';
import type { PickingInfo } from '@deck.gl/core';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BuildingFeature, MetricKey, BuildingProperties } from '../types';
import { normalizedColor, getMetricRange } from '../lib/colorScales';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Warm directional light from the upper-right — brightens south/west faces,
// darkens north/east, giving the 3D blocks strong visual depth.
const LIGHTING = new LightingEffect({
  ambientLight: new AmbientLight({ color: [255, 255, 255], intensity: 0.55 }),
  directionalLight: new DirectionalLight({
    color: [255, 235, 210],
    intensity: 2.4,
    direction: [-2.5, -1.5, -1],
  }),
});

// PBR-style material so buildings respond to the light
const BUILDING_MATERIAL = {
  ambient:       0.35,
  diffuse:       0.65,
  shininess:     28,
  specularColor: [50, 55, 65] as [number, number, number],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ViewState = any;
type AnyFeature = { properties: BuildingProperties };

interface Props {
  buildings: BuildingFeature[];
  activeMetric: MetricKey;
  viewState: ViewState;
  onViewStateChange: (vs: ViewState) => void;
  onBuildingClick: (b: BuildingFeature | null) => void;
  onBuildingHover: (b: BuildingFeature | null, x: number, y: number) => void;
}

export default function CityViewer({
  buildings, activeMetric, viewState, onViewStateChange,
  onBuildingClick, onBuildingHover,
}: Props) {
  const metricRange = useMemo(
    () => getMetricRange(buildings, activeMetric),
    [buildings, activeMetric],
  );

  const layers = [
    new GeoJsonLayer({
      id: 'buildings',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { type: 'FeatureCollection', features: buildings } as any,
      extruded: true,
      wireframe: false,
      material: BUILDING_MATERIAL,
      getElevation: (f: AnyFeature) => f.properties.height,
      getFillColor: (f: AnyFeature) =>
        normalizedColor(f.properties[activeMetric] as number, metricRange[0], metricRange[1]),
      getLineColor: [255, 255, 255, 12] as [number, number, number, number],
      lineWidthMinPixels: 0.5,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 60] as [number, number, number, number],
      onClick: (info: PickingInfo) => {
        if (info.object) onBuildingClick(info.object as BuildingFeature);
      },
      onHover: (info: PickingInfo) => {
        onBuildingHover(
          info.object ? (info.object as BuildingFeature) : null,
          info.x ?? 0,
          info.y ?? 0,
        );
      },
      updateTriggers: { getFillColor: [activeMetric, metricRange] },
      transitions: { getFillColor: 400 },
    }),
  ];

  return (
    <DeckGL
      viewState={viewState}
      onViewStateChange={({ viewState: vs }) => onViewStateChange(vs)}
      layers={layers}
      effects={[LIGHTING]}
      controller={{ dragRotate: true, scrollZoom: true, touchZoom: true }}
      getCursor={({ isDragging }) => isDragging ? 'grabbing' : 'default'}
      onClick={(info: PickingInfo) => { if (!info.object) onBuildingClick(null); }}
    >
      <Map mapStyle={MAP_STYLE} />
    </DeckGL>
  );
}
