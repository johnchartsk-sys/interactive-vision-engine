import { useEffect } from 'react';

type Row = [string, 'ok' | 'warn' | 'alert'];
type Info = { title: string; metrics: [string, string][]; assets: Row[]; note: string };

const DATA: Record<string, Info> = {
  'WATER': {
    title: 'WATER INFRASTRUCTURE',
    metrics: [['Network pressure', '3.2 bar'], ['Flow', '482 L/s'], ['Reservoir level', '78%']],
    assets: [['Von Bach Dam', 'ok'], ['Goreangab Dam', 'ok'], ['Avis Dam', 'warn'], ['Ohangwena Aquifer', 'ok'], ['Pump Station 12', 'warn']],
    note: 'Pressure and flow shown are demo values until sensor data is connected.',
  },
  'RAIL': {
    title: 'RAIL NETWORK',
    metrics: [['Fleet health', '87%'], ['Trains active', '6'], ['Track alerts', '1']],
    assets: [['Windhoek Station', 'ok'], ['Windhoek to Walvis Bay line', 'ok'], ['Windhoek to Keetmanshoop line', 'warn'], ['Locomotives', 'ok']],
    note: 'Track geometry will come from OpenStreetMap. Train positions will be simulated.',
  },
  'PORTS': {
    title: 'PORTS',
    metrics: [['Cargo throughput', '72%'], ['Vessels in port', '4'], ['Berth use', '63%']],
    assets: [['Walvis Bay Port', 'ok'], ['Luderitz Port', 'ok'], ['Container terminal', 'warn']],
    note: 'Demo values. Not connected to live port data.',
  },
  'ENERGY': {
    title: 'POWER GRID',
    metrics: [['Generation', '734 MW'], ['Grid load', '47%'], ['Substation alerts', '0']],
    assets: [['Ruacana Power Station', 'ok'], ['Van Eck Power Station', 'warn'], ['Anixas Power Station', 'ok'], ['Windhoek substations', 'ok']],
    note: 'Demo values. Not connected to live grid data.',
  },
  'CITY & ROADS': {
    title: 'CITY & ROADS',
    metrics: [['Network status', 'Operational'], ['Open incidents', '2'], ['Bridges monitored', '12']],
    assets: [['Roads and bridges', 'ok'], ['Water utilities', 'warn'], ['Electricity utilities', 'ok'], ['Urban infrastructure', 'ok']],
    note: 'Demo values for Windhoek urban infrastructure.',
  },
  'NAMHEALTH': {
    title: 'NAMHEALTH',
    metrics: [['Facilities connected', 'All'], ['Equipment alerts', '1'], ['Backup power', 'Ready']],
    assets: [['Windhoek Central Hospital', 'ok'], ['Katutura State Hospital', 'ok'], ['Clinics', 'ok'], ['Medical equipment', 'warn']],
    note: 'Demo values. Not connected to health systems.',
  },
};

const COLOR = { ok: '#34d399', warn: '#fbbf24', alert: '#f87171' };
const LABEL = { ok: 'Normal', warn: 'Watch', alert: 'Alert' };

export function SectorDetail({ name, onClose }: { name: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!name) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [name, onClose]);

  const info = name ? DATA[name] : undefined;
  if (!info) return null;

  return (
    <aside
      aria-label={info.title}
      style={{
        position: 'fixed', top: 90, right: 24, width: 340, maxHeight: '75vh', overflowY: 'auto',
        zIndex: 60, padding: 16, borderRadius: 12, color: '#e6faff',
        background: 'rgba(4, 22, 36, 0.96)', border: '1px solid #22d3ee',
        boxShadow: '0 0 24px rgba(34, 211, 238, 0.35)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong style={{ letterSpacing: 2, fontSize: 14 }}>{info.title}</strong>
        <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#e6faff', fontSize: 20, cursor: 'pointer' }}>×</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
        {info.metrics.map(([k, v]) => (
          <div key={k} style={{ padding: 8, borderRadius: 8, background: 'rgba(34, 211, 238, 0.08)' }}>
            <div style={{ fontSize: 10, opacity: 0.7 }}>{k}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#22d3ee' }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.7, marginBottom: 6 }}>ASSETS</div>
      {info.assets.map(([a, s]) => (
        <div key={a} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: 13 }}>
          <span>{a}</span>
          <span style={{ color: COLOR[s] }}>● {LABEL[s]}</span>
        </div>
      ))}
      <div style={{ marginTop: 12, fontSize: 11, opacity: 0.7 }}>
        <span style={{ color: '#fbbf24', fontWeight: 700 }}>DEMO · </span>{info.note}
      </div>
    </aside>
  );
}