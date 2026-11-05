// @ts-nocheck
import { useEffect } from 'react';
import { Waves } from 'lucide-react';
import { Panel } from './panels';
import { attachSupply, failNamWater, restoreNamWater, setAuto, SOURCES, useSupply } from './supply';

const COL = { ok: '#34d399', warn: '#fbbf24', bad: '#f87171' };

function status(s, x) {
  if (x.key === 'nam') return s.namOnline ? ['ONLINE', 'ok'] : ['OUTAGE', 'bad'];
  if (x.key === 'bore' && !s.namOnline && s.aquiferPct <= 3) return ['AQUIFER LOW', 'bad'];
  const diff = s.target[x.key] - s.actual[x.key];
  if (Math.abs(diff) > 2) return [diff > 0 ? (x.key === 'bore' ? 'SPINNING UP' : 'RAMPING UP') : 'THROTTLING DOWN', 'warn'];
  if (s.actual[x.key] >= x.cap * 0.98) return ['AT MAXIMUM', 'warn'];
  return [x.key === 'bore' && s.mode === 'Standby' ? 'STANDBY' : 'ONLINE', 'ok'];
}

export function SupplyPanel({ sim, snap }) {
  const s = useSupply();
  useEffect(() => attachSupply(sim), [sim]);
  useEffect(() => {
    const h = (e) => {
      const d = (e && e.detail) || {};
      if (d.action === 'water_namwater_fail') failNamWater();
      else if (d.action === 'water_namwater_restore') restoreNamWater();
    };
    window.addEventListener('nia-water', h);
    return () => window.removeEventListener('nia-water', h);
  }, []);

  const tot = s.actual.nam + s.actual.rec + s.actual.bore || 1;
  const r1 = snap.nodes.find((n) => n.id === 'R-1');
  let eta = '';
  if (r1 && s.factor < 0.995) {
    const net = r1.outflowGPM - r1.inflowGPM;
    if (net > 1) { const h = r1.volumeGal / net / 60; eta = h >= 1 ? h.toFixed(1) + ' h' : Math.round(h * 60) + ' min'; }
  }
  const modeCol = s.mode === 'Injection' ? '#22d3ee' : s.mode === 'Abstraction' ? '#fbbf24' : '#94a3b8';

  return (
    <Panel
      title="Water supply mix" icon={<Waves size={13} />}
      right={<span className="text-[10px] font-bold text-amber-300">{'\u25cf'} SIMULATED</span>}
    >
      <div className="mb-1 text-[11px] text-slate-400">Mix entering the network: {Math.round(tot)} GPM</div>
      <div className="flex h-3 w-full overflow-hidden rounded bg-slate-700">
        {SOURCES.map((x) => <div key={x.key} title={x.label} style={{ width: (100 * s.actual[x.key]) / tot + '%', background: x.color }} />)}
      </div>
      <div className="mt-2 space-y-1.5">
        {SOURCES.map((x) => {
          const st = status(s, x);
          return (
            <div key={x.key} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span style={{ color: x.color }}>{'\u25a0'} {x.label}</span>
                <span className="rounded px-1.5 text-[10px] font-bold" style={{ color: COL[st[1]], border: '1px solid ' + COL[st[1]] }}>{st[0]}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <div className="h-1.5 flex-1 rounded bg-slate-700"><div className="h-full rounded" style={{ width: Math.min(100, (100 * s.actual[x.key]) / x.cap) + '%', background: x.color }} /></div>
                <span className="w-24 text-right text-slate-200">{s.actual[x.key].toFixed(0)} GPM {'\u00b7'} {((100 * s.actual[x.key]) / tot).toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 rounded-lg border border-slate-700 bg-slate-800/50 p-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-100">Windhoek aquifer: water bank</span>
          <span className="rounded px-1.5 text-[10px] font-bold" style={{ color: modeCol, border: '1px solid ' + modeCol }}>{s.mode.toUpperCase()}</span>
        </div>
        <div className="mt-1 h-1.5 rounded bg-slate-700"><div className="h-full rounded" style={{ width: s.aquiferPct + '%', background: s.aquiferPct < 30 ? '#f87171' : '#22d3ee' }} /></div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>Storage {s.aquiferPct.toFixed(0)}% (assumed scale)</span>
          <span>{s.mode === 'Injection' ? 'storing ' + s.injectGPM.toFixed(0) + ' GPM' : s.mode === 'Abstraction' ? 'withdrawing ' + s.actual.bore.toFixed(0) + ' GPM' : 'base withdrawal ' + s.actual.bore.toFixed(0) + ' GPM'}</span>
        </div>
      </div>

      {s.factor < 0.995 && (
        <div className="mt-2 rounded border border-red-500/50 bg-red-500/10 p-2 text-xs text-red-200">
          Supply covers {Math.round(s.factor * 100)}% of what the network asks for. Reservoirs are draining.{eta && ' R-1 empties in about ' + eta + ' (simulated clock).'}
        </div>
      )}
      {!s.namOnline && s.recommended && (
        <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          NIA Watch recommends Category {s.recommended}{s.beyond ? ', which still leaves a gap: emergency measures needed.' : '.'} Actual saving depends on resident compliance.
        </div>
      )}

      <div className="mt-2 flex gap-2">
        {s.namOnline
          ? <button className="flex-1 rounded border border-red-500/60 bg-red-500/10 px-2 py-1 text-[11px] text-red-300" onClick={() => failNamWater()}>Simulate NamWater pipeline failure</button>
          : <button className="flex-1 rounded border border-cyan-500/60 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-300" onClick={() => restoreNamWater()}>Restore NamWater supply</button>}
      </div>
      <label className="mt-1 flex cursor-pointer items-start gap-2 text-[11px] text-slate-200">
        <input type="checkbox" className="mt-0.5" checked={s.auto} onChange={(e) => setAuto(e.target.checked)} />
        <span>Let NIA Watch declare a scarcity category automatically (simulated)</span>
      </label>
      {s.events.length > 0 && (
        <div className="mt-2 space-y-0.5 border-t border-slate-700/60 pt-1 font-mono text-[10px] text-slate-500">
          {s.events.slice(0, 4).map((e, i) => <div key={i}>{e.time} {e.text}</div>)}
        </div>
      )}
      <div className="mt-2 text-[10px] leading-snug text-slate-500">
        Normal mix follows the reported 2021 figures. Source capacities are assumptions. The dams and the bulk pipeline belong to NamWater, not the City.
      </div>
    </Panel>
  );
}