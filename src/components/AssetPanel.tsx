import { useEffect, useState } from 'react';
import { selectAsset, useSelectedAsset } from '@/lib/assetBus';
import { runMapCommand } from '@/lib/mapBus';

export function AssetPanel() {
  const asset = useSelectedAsset();
  const [, tick] = useState(0);

  useEffect(() => {
    if (!asset?.live) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [asset]);

  useEffect(() => {
    if (!asset) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') selectAsset(null); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [asset]);

  if (!asset) return null;
  const rows: [string, string][] = [...asset.props, ...(asset.live ? asset.live() : [])];
  const badge = asset.simulated
    ? { text: 'SIMULATED', color: '#fbbf24' }
    : { text: 'REAL DATA \u00b7 OpenStreetMap', color: '#34d399' };

  return (
    <aside
      aria-label={asset.name}
      style={{
        position: 'fixed', top: 90, left: 24, width: 330, maxHeight: '75vh', overflowY: 'auto',
        zIndex: 60, padding: 16, borderRadius: 12, color: '#e6faff',
        background: 'rgba(4, 22, 36, 0.96)', border: '1px solid #22d3ee',
        boxShadow: '0 0 24px rgba(34, 211, 238, 0.35)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ letterSpacing: 1, fontSize: 14 }}>{asset.name}</strong>
        <button onClick={() => selectAsset(null)} aria-label="Close" style={{ background: 'none', border: 'none', color: '#e6faff', fontSize: 20, cursor: 'pointer' }}>{'\u00d7'}</button>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: badge.color, marginBottom: 10 }}>{'\u25cf'} {badge.text}</div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: 12 }}>
          <span style={{ opacity: 0.7 }}>{k}</span>
          <span style={{ textAlign: 'right' }}>{v}</span>
        </div>
      ))}
      {asset.kind === 'train' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={() => runMapCommand({ action: 'follow_train', place: String(asset.trainNo ?? 1) })} style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #22d3ee', background: 'rgba(34,211,238,0.12)', color: '#e6faff', cursor: 'pointer' }}>Follow</button>
          <button onClick={() => runMapCommand({ action: 'stop_following' })} style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)', background: 'none', color: '#e6faff', cursor: 'pointer' }}>Stop following</button>
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 11, opacity: 0.7 }}>
        {asset.simulated
          ? 'Simulated asset. Not a real TransNamib locomotive. Condition and maintenance records come in the next step.'
          : 'Track geometry and tags are real OpenStreetMap data. Condition and maintenance records come in the next step.'}
      </div>
    </aside>
  );
}