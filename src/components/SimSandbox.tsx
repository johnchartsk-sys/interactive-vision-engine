// @ts-nocheck
import { useEffect, useState } from 'react';
import { getAsset, selectAsset, useSelectedAsset } from '@/lib/assetBus';
import { triggerFault, clearFault, isFaulted, useLog } from '@/lib/faultSim';

const IDS = ['SIM-LOCO-01', 'SIM-LOCO-02', 'SIM-LOCO-03'];
const field = { width: '100%', padding: '5px 6px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)', color: '#e6faff', fontSize: 12, marginBottom: 8 };

export function SimSandbox() {
  const [mapOpen, setMapOpen] = useState(false);
  const [id, setId] = useState('SIM-LOCO-01');
  const [folded, setFolded] = useState(false);
  const [, tick] = useState(0);
  const selected = useSelectedAsset();
  const log = useLog();

  useEffect(() => {
    const t = setInterval(() => { setMapOpen(!!document.querySelector('.cesium-viewer')); tick((n) => n + 1); }, 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (selected && selected.kind === 'train') setId(selected.id); }, [selected]);

  if (!mapOpen) return null;
  const trains = IDS.filter((x) => getAsset(x));
  const faulted = isFaulted(id);

  return (
    <aside
      aria-label="Simulation sandbox"
      style={{ position: 'fixed', bottom: 24, right: 24, width: 330, zIndex: 55, padding: 12, borderRadius: 12, color: '#e6faff', background: 'rgba(4, 22, 36, 0.97)', border: '1px solid #fbbf24', boxShadow: '0 0 20px rgba(251, 191, 36, 0.25)' }}
    >
      <style>{'@keyframes niaFlash{0%,100%{background:transparent}50%{background:rgba(239,68,68,0.35)}}'}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 12, letterSpacing: 1, color: '#fbbf24' }}>SIMULATION SANDBOX</strong>
        <button onClick={() => setFolded((f) => !f)} aria-label="Fold" style={{ background: 'none', border: 'none', color: '#e6faff', cursor: 'pointer', fontSize: 16 }}>{folded ? '+' : '\u2212'}</button>
      </div>
      {!folded && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 4 }}>Simulated only. No real data or system is changed.</div>
          <select value={id} onChange={(e) => setId(e.target.value)} style={field} aria-label="Asset">
            {trains.length === 0 && <option>Loading trains...</option>}
            {trains.map((x) => <option key={x} value={x} style={{ color: '#000' }}>{x}</option>)}
          </select>
          <select style={field} aria-label="Fault type" defaultValue="hotbox">
            <option value="hotbox" style={{ color: '#000' }}>Axle bearing temperature spike (hot box)</option>
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={trains.length === 0 || faulted}
              onClick={() => triggerFault(id)}
              style={{ flex: 2, padding: '8px', borderRadius: 6, border: '1px solid #fbbf24', background: faulted ? 'rgba(255,255,255,0.08)' : '#f59e0b', color: faulted ? '#999' : '#1a1000', fontWeight: 700, cursor: faulted ? 'default' : 'pointer', fontSize: 11 }}
            >{faulted ? 'FAULT ACTIVE' : 'TRIGGER SIMULATED FAULT'}</button>
            <button
              disabled={!faulted}
              onClick={() => clearFault(id)}
              style={{ flex: 1, padding: '8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)', background: 'none', color: faulted ? '#e6faff' : '#777', cursor: faulted ? 'pointer' : 'default', fontSize: 11 }}
            >Clear</button>
          </div>

          <div style={{ marginTop: 12, fontSize: 11, letterSpacing: 1, fontWeight: 700, borderBottom: '1px solid rgba(251,191,36,0.4)', paddingBottom: 3 }}>SYSTEM EVENT LOG <span style={{ color: '#fbbf24', fontWeight: 700 }}>{'\u25cf'} SIMULATED</span></div>
          <div style={{ maxHeight: 230, overflowY: 'auto', marginTop: 4 }}>
            {log.length === 0 && <div style={{ fontSize: 11, opacity: 0.6, padding: '6px 0' }}>No events yet. Trigger a fault to see an alert here.</div>}
            {log.map((e, i) => (
              <div
                key={e.key}
                onClick={() => selectAsset(e.asset)}
                style={{ cursor: 'pointer', padding: '6px 4px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontFamily: 'monospace', fontSize: 10.5, lineHeight: 1.45, animation: i === 0 ? 'niaFlash 1s ease-in-out 3' : undefined }}
              >
                <div>
                  <span style={{ opacity: 0.7 }}>[{e.time}]</span>{' '}
                  <span style={{ color: e.level.startsWith('ALERT') ? '#f87171' : '#34d399', fontWeight: 700 }}>[{e.level}]</span>{' '}
                  <span>[ASSET: {e.asset}]</span> <span style={{ opacity: 0.7 }}>[CODE: {e.code}]</span>
                </div>
                {e.lines.map((l, k) => <div key={k} style={{ opacity: 0.9 }}>{l}</div>)}
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}