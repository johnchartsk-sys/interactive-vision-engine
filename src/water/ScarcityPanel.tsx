// @ts-nocheck
import { useEffect, useState } from 'react';
import { Droplets, Network } from 'lucide-react';
import { Panel } from './panels';
import { ASSUMPTIONS, CATEGORIES } from './assumptions';
import { attachScarcity, setCategory, setCompliance, targetFactor, useScarcity } from './scarcity';

const BADGE = {
  reported: 'bg-emerald-500/20 text-emerald-300',
  assumed: 'bg-amber-500/20 text-amber-300',
  invented: 'bg-orange-500/20 text-orange-300',
};

function R({ k, v, c }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-700/50 py-1 text-xs">
      <span className="text-slate-400">{k}</span>
      <span className="text-right" style={{ color: c || '#f1f5f9' }}>{v}</span>
    </div>
  );
}

function parseCategory(p) {
  const up = String(p || '').toUpperCase();
  const m = up.match(/CATEGORY\s*([A-E])|\b([A-E])\b/);
  if (m) return m[1] || m[2];
  if (/NORMAL|NONE|NO RESTRICT/.test(up)) return 'A';
  if (/ALERT/.test(up)) return 'B';
  if (/SEVERE|DROUGHT/.test(up)) return 'D';
  if (/CRITICAL|EMERGENCY/.test(up)) return 'E';
  if (/SCARCITY/.test(up)) return 'C';
  return '';
}

export function ScarcityPanel({ sim, snap }) {
  const sc = useScarcity();
  useEffect(() => attachScarcity(sim), [sim]);
  useEffect(() => {
    const h = (e) => {
      const d = (e && e.detail) || {};
      if (d.action === 'water_scarcity') { const c = parseCategory(d.place); if (c) setCategory(c); }
      else if (d.action === 'water_compliance') {
        const v = Number(String(d.place || '').replace(/[^0-9.]/g, ''));
        if (!isNaN(v)) setCompliance(v > 1 ? v / 100 : v);
      }
    };
    window.addEventListener('nia-water', h);
    return () => window.removeEventListener('nia-water', h);
  }, []);

  const cat = CATEGORIES.find((c) => c.id === sc.category) || CATEGORIES[0];
  const actual = cat.target * sc.compliance;
  const demand = snap.kpi.demandGPM;
  const base = demand / Math.max(0.05, sc.current);
  const adjusting = Math.abs(sc.current - targetFactor(sc)) > 0.002;

  return (
    <Panel
      title="Active municipal scarcity level" icon={<Droplets size={13} />}
      right={<span className={'rounded px-1.5 py-0.5 text-[10px] ' + BADGE[cat.confidence]}>{cat.confidence}</span>}
    >
      <select
        aria-label="Water scarcity category" value={sc.category} onChange={(e) => setCategory(e.target.value)}
        className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-100"
      >
        {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{'Category ' + c.id + ': ' + c.name}</option>)}
      </select>
      <div className="mt-2">
        <R k="City saving target" v={Math.round(cat.target * 100) + '%'} />
        <div className="py-1 text-xs">
          <div className="flex justify-between"><span className="text-slate-400">Resident compliance (assumed)</span><span className="text-slate-100">{Math.round(sc.compliance * 100)}%</span></div>
          <input type="range" min="0" max="100" step="5" value={Math.round(sc.compliance * 100)} onChange={(e) => setCompliance(Number(e.target.value) / 100)} className="w-full" aria-label="Resident compliance" />
        </div>
        <R k="Actual saving" v={(actual * 100).toFixed(1) + '%'} c="#22d3ee" />
        <R k="Demand now" v={demand.toFixed(0) + ' GPM' + (adjusting ? ' (adjusting...)' : '')} />
        <R k="Without restrictions" v={base.toFixed(0) + ' GPM'} />
      </div>
      <div className="mt-2 text-[10px] leading-snug text-slate-500">
        {cat.note} This is a scenario in a simulation. Compliance is an assumption.
      </div>
    </Panel>
  );
}

export function AssumptionsPanel() {
  const [open, setOpen] = useState(false);
  return (
    <Panel
      title="Assumptions and sources" icon={<Network size={13} />}
      right={<button className="rounded border border-slate-600 px-2 py-0.5 text-[10px] text-slate-300" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show ' + ASSUMPTIONS.length}</button>}
    >
      {!open && <div className="text-[11px] text-slate-400">Every Windhoek figure here is marked reported, assumed or invented, with its source.</div>}
      {open && (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {ASSUMPTIONS.map((a, i) => (
            <div key={i} className="rounded-lg border border-slate-700 bg-slate-800/50 p-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-slate-100">{a.topic}</span>
                <span className={'shrink-0 rounded px-1.5 text-[10px] ' + BADGE[a.confidence]}>{a.confidence}</span>
              </div>
              <div className="text-slate-300">{a.value}</div>
              <div className="text-[10px] text-slate-500">{a.source}</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}