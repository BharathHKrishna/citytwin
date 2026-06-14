import { BuildingFeature } from '../types';

interface Props {
  building: BuildingFeature;
  onClose: () => void;
}

function mwh(kwh: number): string {
  return kwh >= 1000
    ? `${(kwh / 1000).toFixed(1)} MWh/yr`
    : `${Math.round(kwh)} kWh/yr`;
}

export default function BuildingPanel({ building, onClose }: Props) {
  const p = building.properties;

  return (
    <div className="building-panel">
      <div className="panel-header">
        <span className="panel-title">{p.building_type || 'Building'}</span>
        <button className="close-btn" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="panel-body">

        <div className="panel-section-label">Geometry</div>
        <StatRow label="Height"     value={`${p.height.toFixed(1)} m`} />
        <StatRow label="Storeys"    value={String(p.levels)} />
        <StatRow label="Roof area"  value={`${Math.round(p.footprint_area)} m²`} />

        <div className="panel-section-label">Solar potential</div>
        <StatRow
          label="Est. annual yield"
          value={mwh(p.solar_kwh_year)}
          accent
        />
        <StatRow
          label="Relative potential"
          value={`${(p.solar_potential * 100).toFixed(0)}%`}
        />
        <div className="panel-note">
          Based on GHI 1 184 kWh/m²/yr (Global Solar Atlas)
        </div>

        <div className="panel-section-label">Heat demand</div>
        <StatRow
          label="Est. annual demand"
          value={mwh(p.heat_kwh_year)}
          accent
        />
        <StatRow
          label="Relative demand"
          value={`${(p.heat_demand_proxy * 100).toFixed(0)}%`}
        />
        <div className="panel-note">
          Volume × specific heat loss (IWU building stock model)
        </div>

      </div>
    </div>
  );
}

function StatRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className={`stat-value${accent ? ' stat-accent' : ''}`}>{value}</span>
    </div>
  );
}
