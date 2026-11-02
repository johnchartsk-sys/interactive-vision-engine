import type { ReactNode } from 'react';
import { Activity, Bell, Droplets, Gauge, Network, Waves, Wrench, X, Zap } from 'lucide-react';
import {
  fmtClock, TARGET_DEMAND_GPM, TARGET_PRESSURE_PSI,
  type Alert, type ConditionClass, type EdgeState, type HistoryPoint, type Kpi, type LeakEntry, type NodeState, type Ticket,
} from './engine';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export function Panel({ title, icon, right, children, className = '' }: { title: string; icon?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-cyan-500/20 bg-slate-900/70 p-3 shadow-lg shadow-black/30', className)}>
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-cyan-300">{icon}{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full rounded bg-slate-700/70">
      <div className="h-full rounded" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-700/50 py-1 text-xs">
      <span className="text-slate-400">{k}</span>
      <span className="text-right text-slate-100">{v}</span>
    </div>
  );
}

const SEV: Record<string, string> = {
  critical: 'border-red-500/50 bg-red-500/15 text-red-300',
  warning: 'border-amber-500/50 bg-amber-500/15 text-amber-300',
  info: 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300',
};
const CLASS_COLOR: Record<ConditionClass, string> = { Good: '#34d399', Fair: '#22d3ee', Poor: '#fbbf24', Critical: '#f87171' };

export function RadialGauge({ label, value, target, max, unit, sub }: { label: string; value: number; target: number; max: number; unit: string; sub: string }) {
  const R = 46;
  const C = 2 * Math.PI * R;
  const arc = C * 0.75;
  const pct = Math.min(1, Math.max(0, value / max));
  const dev = target > 0 ? Math.abs(value - target) / target : 0;
  const color = dev <= 0.15 ? '#22d3ee' : dev <= 0.3 ? '#fbbf24' : '#f87171';
  const a = ((135 + 270 * Math.min(1, target / max)) * Math.PI) / 180;
  const p = (r: number) => ({ x: 60 + r * Math.cos(a), y: 60 + r * Math.sin(a) });
  const t1 = p(R - 9);
  const t2 = p(R + 7);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 120" className="w-32" role="img" aria-label={`${label} ${value.toFixed(0)} ${unit}`}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="#1e293b" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${arc} ${C}`} transform="rotate(135 60 60)" />
        <circle cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${arc * pct} ${C}`} transform="rotate(135 60 60)" />
        <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke="#e2e8f0" strokeWidth="2" />
        <text x="60" y="60" textAnchor="middle" fontSize="24" fontWeight="700" fill="#f1f5f9">{value.toFixed(0)}</text>
        <text x="60" y="76" textAnchor="middle" fontSize="10" fill="#94a3b8">{unit}</text>
      </svg>
      <div className="-mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">{label}</div>
      <div className="text-[10px] text-slate-500">{sub}</div>
    </div>
  );
}

export function GaugesPanel({ kpi }: { kpi: Kpi }) {
  return (
    <Panel title="System pressure and flow" icon={<Gauge size={13} />}>
      <div className="grid grid-cols-2 gap-2">
        <RadialGauge label="Pressure" value={kpi.pressurePsi} target={TARGET_PRESSURE_PSI} max={100} unit="PSI" sub={`target ${TARGET_PRESSURE_PSI} PSI (${(TARGET_PRESSURE_PSI / 14.504).toFixed(1)} bar)`} />
        <RadialGauge label="Demand" value={kpi.demandGPM} target={TARGET_DEMAND_GPM} max={1500} unit="GPM" sub={`target ${TARGET_DEMAND_GPM} GPM`} />
      </div>
    </Panel>
  );
}

export function ConsumptionChart({ history }: { history: HistoryPoint[] }) {
  const W = 320;
  const H = 130;
  const padL = 30;
  const padB = 16;
  const max = Math.max(TARGET_DEMAND_GPM * 1.5, ...history.map((h) => Math.max(h.demand, h.supply))) * 1.05;
  const n = history.length;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (W - padL - 4);
  const y = (v: number) => 6 + (1 - v / max) * (H - padB - 6);
  const path = (get: (h: HistoryPoint) => number) => history.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(get(h)).toFixed(1)}`).join(' ');
  const first = history[0];
  const last = history[n - 1];
  return (
    <Panel title="Real-time consumption" icon={<Activity size={13} />} right={<span className="text-[10px] text-slate-500">simulated clock</span>}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Consumption over time">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={W - 4} y1={y(max * f)} y2={y(max * f)} stroke="#334155" strokeWidth="0.5" />
            <text x={padL - 4} y={y(max * f) + 3} textAnchor="end" fontSize="8" fill="#64748b">{Math.round(max * f)}</text>
          </g>
        ))}
        <line x1={padL} x2={W - 4} y1={y(TARGET_DEMAND_GPM)} y2={y(TARGET_DEMAND_GPM)} stroke="#fbbf24" strokeWidth="1" strokeDasharray="4 3" />
        <path d={path((h) => h.supply)} fill="none" stroke="#6366f1" strokeWidth="1.5" />
        <path d={path((h) => h.demand)} fill="none" stroke="#22d3ee" strokeWidth="2" />
        {first && <text x={padL} y={H - 3} fontSize="8" fill="#64748b">{fmtClock(first.clockMin)}</text>}
        {last && <text x={W - 4} y={H - 3} textAnchor="end" fontSize="8" fill="#64748b">{fmtClock(last.clockMin)}</text>}
      </svg>
      <div className="flex gap-3 text-[10px] text-slate-400">
        <span><span className="text-cyan-400">{'\u25a0'}</span> Demand (GPM)</span>
        <span><span className="text-indigo-400">{'\u25a0'}</span> Supply</span>
        <span><span className="text-amber-400">{'--'}</span> Target {TARGET_DEMAND_GPM}</span>
      </div>
    </Panel>
  );
}

export function ConditionPanel({ kpi }: { kpi: Kpi }) {
  const rows: Array<[ConditionClass, string]> = [['Good', '75-100%'], ['Fair', '50-74%'], ['Poor', '20-49%'], ['Critical', '<20% or broken']];
  const total = rows.reduce((s, [c]) => s + kpi.counts[c], 0) || 1;
  return (
    <Panel title="Network pipe condition" icon={<Network size={13} />}>
      <div className="mb-2 flex items-end gap-3">
        <div className="text-3xl font-bold text-slate-100">{kpi.health.toFixed(0)}<span className="text-lg text-slate-400">%</span></div>
        <div className="pb-1 text-[11px] text-slate-400">overall health (length-weighted)</div>
      </div>
      {rows.map(([c, range]) => (
        <div key={c} className="mb-1.5">
          <div className="flex justify-between text-[11px]">
            <span style={{ color: CLASS_COLOR[c] }}>{c === 'Critical' ? 'Critical / Replace' : c} <span className="text-slate-500">{range}</span></span>
            <span className="text-slate-300">{kpi.counts[c]} pipes, {kpi.km[c].toFixed(1)} km</span>
          </div>
          <Bar pct={(kpi.counts[c] / total) * 100} color={CLASS_COLOR[c]} />
        </div>
      ))}
    </Panel>
  );
}

export function AlertsPanel({ alerts, leaks, kpi, onSelect, onAck }: { alerts: Alert[]; leaks: LeakEntry[]; kpi: Kpi; onSelect: (id: string) => void; onAck: (id: string) => void }) {
  const active = alerts.filter((a) => a.active).length;
  const order = { critical: 0, warning: 1, info: 2 } as const;
  const sorted = [...alerts].sort((a, b) => Number(b.active) - Number(a.active) || order[a.severity] - order[b.severity] || b.seq - a.seq);
  return (
    <Panel
      title="Leakage detection and alerts" icon={<Bell size={13} />}
      right={<span className={cx('rounded-full border px-2 py-0.5 text-[10px]', active ? SEV['critical'] : SEV['info'])}>{active} active</span>}
    >
      <div className="mb-2 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-slate-800/70 p-2"><div className="text-lg font-bold text-slate-100">{kpi.leakageGPM.toFixed(0)}</div><div className="text-[10px] text-slate-400">leakage GPM</div></div>
        <div className="rounded-lg bg-slate-800/70 p-2"><div className="text-lg font-bold text-slate-100">{kpi.nrwPct.toFixed(1)}%</div><div className="text-[10px] text-slate-400">of supply lost</div></div>
      </div>
      {leaks.slice(0, 3).map((l) => (
        <div key={l.assetId} className="flex justify-between text-[11px] text-slate-400">
          <span>{l.type}: {l.name}</span><span className="text-slate-200">{l.gpm.toFixed(0)} GPM</span>
        </div>
      ))}
      <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {sorted.length === 0 && <div className="py-3 text-center text-xs text-slate-500">No alerts. Network operating normally.</div>}
        {sorted.map((a) => (
          <div key={a.id} className={cx('cursor-pointer rounded-lg border p-2 text-xs', a.active ? SEV[a.severity] : 'border-slate-700 bg-slate-800/40 text-slate-500')} onClick={() => onSelect(a.assetId)}>
            <div className="flex justify-between gap-2">
              <span className="font-semibold uppercase tracking-wide">{a.active ? a.severity : 'resolved'} {'\u00b7'} {a.assetId}</span>
              <span className="text-[10px] opacity-70">{a.time}</span>
            </div>
            <div className="mt-0.5 text-slate-200/90">{a.message}</div>
            {a.active && !a.acknowledged && (
              <button className="mt-1 rounded border border-current px-1.5 py-0.5 text-[10px]" onClick={(e) => { e.stopPropagation(); onAck(a.id); }}>Acknowledge</button>
            )}
            {a.active && a.acknowledged && <div className="mt-1 text-[10px] opacity-70">Acknowledged</div>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function MaintenancePanel({ tickets, onSelect, onDispatch }: { tickets: Ticket[]; onSelect: (id: string) => void; onDispatch: (id: string) => void }) {
  return (
    <Panel title="Active maintenance" icon={<Wrench size={13} />} right={<span className="text-[10px] text-slate-500">{tickets.filter((t) => t.status !== 'Done').length} open</span>}>
      <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
        {tickets.length === 0 && <div className="py-3 text-center text-xs text-slate-500">No open work orders.</div>}
        {tickets.map((t) => (
          <div key={t.id} className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800/50 p-2 text-xs" onClick={() => onSelect(t.assetId)}>
            <div className="flex justify-between gap-2">
              <span className="font-semibold text-slate-100">{t.id} {'\u00b7'} {t.assetId}</span>
              <span className={cx('rounded px-1.5 text-[10px]', t.priority === 'Emergency' ? 'bg-red-500/20 text-red-300' : 'bg-slate-600/40 text-slate-300')}>{t.priority}</span>
            </div>
            <div className="text-slate-300">{t.task}</div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-400">
              <span>{t.status}</span>
              {t.status === 'Open' && <button className="rounded border border-cyan-500/50 px-1.5 py-0.5 text-cyan-300" onClick={(e) => { e.stopPropagation(); onDispatch(t.id); }}>Dispatch now</button>}
            </div>
            {(t.status === 'Repairing' || t.status === 'Done') && <div className="mt-1"><Bar pct={t.progress} color="#22d3ee" /></div>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function AssetGrid({ nodes, onSelect, onTogglePump }: { nodes: NodeState[]; onSelect: (id: string) => void; onTogglePump: (id: string) => void }) {
  const items = nodes.filter((n) => n.type !== 'DemandPoint');
  return (
    <Panel title="Pump stations and storage" icon={<Zap size={13} />}>
      <div className="space-y-2">
        {items.map((n) => {
          const isRes = n.type === 'Reservoir';
          const bad = n.health === 'down' || n.health === 'alert';
          return (
            <div key={n.id} className={cx('cursor-pointer rounded-lg border p-2 text-xs', bad ? 'border-red-500/50 bg-red-500/10' : 'border-slate-700 bg-slate-800/50')} onClick={() => onSelect(n.id)}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold text-slate-100">{isRes ? <Waves size={12} /> : <Zap size={12} />}{n.name}</span>
                <span className={cx('rounded px-1.5 text-[10px]', n.online ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/25 text-red-300')}>{isRes ? `${n.levelPct.toFixed(0)}% full` : n.online ? 'ONLINE' : 'OFFLINE'}</span>
              </div>
              {isRes ? (
                <div className="mt-1.5">
                  <Bar pct={n.levelPct} color={n.levelPct < 30 ? '#f87171' : '#22d3ee'} />
                  <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                    <span>{(n.volumeGal / 1000).toFixed(0)}k / {(n.capacityGal / 1000).toFixed(0)}k gal</span>
                    <span>in {n.inflowGPM.toFixed(0)} / out {n.outflowGPM.toFixed(0)} GPM</span>
                  </div>
                </div>
              ) : (
                <div className="mt-1.5">
                  <Bar pct={n.loadPct} color={n.loadPct > 90 ? '#fbbf24' : '#22d3ee'} />
                  <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                    <span>load {n.loadPct.toFixed(0)}% ({n.outflowGPM.toFixed(0)} GPM)</span>
                    <span>uptime 24 h: {n.uptimePct}%</span>
                  </div>
                  <div className="mt-1 flex gap-px">
                    {n.uptime.map((u, i) => <div key={i} className={cx('h-2 flex-1 rounded-sm', u ? 'bg-emerald-500/70' : 'bg-red-500')} />)}
                  </div>
                  {n.type === 'PumpStation' && (
                    <button className="mt-1.5 rounded border border-amber-500/50 px-2 py-0.5 text-[10px] text-amber-300" onClick={(e) => { e.stopPropagation(); onTogglePump(n.id); }}>
                      {n.online ? 'Trip pump (simulate fault)' : 'Restore pump'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

const STATUS_STYLE: Record<string, string> = {
  normal: 'bg-cyan-500/20 text-cyan-300', poor: 'bg-amber-500/20 text-amber-300',
  critical: 'bg-orange-500/25 text-orange-300', broken: 'bg-red-500/30 text-red-300',
};

export function Inspector({ edge, node, ticket, onClose, onBreak, onDispatch, onTogglePump }: {
  edge: EdgeState | undefined; node: NodeState | undefined; ticket: Ticket | undefined;
  onClose: () => void; onBreak: (id: string) => void; onDispatch: (ticketId: string) => void; onTogglePump: (id: string) => void;
}) {
  if (!edge && !node) return null;
  return (
    <aside className="absolute right-3 top-3 z-10 w-72 rounded-xl border border-cyan-400/40 bg-slate-950/95 p-3 text-xs shadow-xl shadow-black/50">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-100">{edge ? edge.name : node?.name}</div>
          <div className="text-[10px] text-slate-400">{edge ? `${edge.id} \u00b7 ${edge.kind}` : `${node?.id} \u00b7 ${node?.type}`}</div>
        </div>
        <button aria-label="Close inspector" onClick={onClose} className="text-slate-400 hover:text-white"><X size={16} /></button>
      </div>
      <div className="mb-2 text-[10px] font-bold text-amber-300">{'\u25cf'} SIMULATED ASSET</div>
      {edge && (
        <div>
          <span className={cx('mb-1 inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase', STATUS_STYLE[edge.status])}>{edge.status}</span>
          <Row k="Flow" v={`${edge.currentFlow.toFixed(0)} / ${edge.capacityGPM} GPM (${(edge.utilisation * 100).toFixed(0)}%)`} />
          <Row k="Pressure (downstream end)" v={`${edge.currentPressure.toFixed(0)} PSI (${(edge.currentPressure / 14.504).toFixed(1)} bar)`} />
          <Row k="Condition" v={`${edge.condition.toFixed(0)}% (${edge.conditionClass})`} />
          <div className="my-1"><Bar pct={edge.condition} color={CLASS_COLOR[edge.conditionClass]} /></div>
          <Row k="Leakage" v={`${edge.leakGPM.toFixed(1)} GPM`} />
          <Row k="Diameter / material" v={`${edge.diameterMm} mm ${edge.material}`} />
          <Row k="Length" v={`${(edge.lengthM / 1000).toFixed(2)} km`} />
          <div className="mt-2 flex gap-2">
            {edge.status !== 'broken' && <button className="flex-1 rounded border border-red-500/60 bg-red-500/10 px-2 py-1 text-red-300" onClick={() => onBreak(edge.id)}>Simulate break</button>}
            {ticket && ticket.status === 'Open' && <button className="flex-1 rounded border border-cyan-500/60 bg-cyan-500/10 px-2 py-1 text-cyan-300" onClick={() => onDispatch(ticket.id)}>Dispatch crew</button>}
          </div>
          {ticket && ticket.status !== 'Open' && <div className="mt-2 text-slate-300">{ticket.id}: {ticket.status}</div>}
        </div>
      )}
      {node && (
        <div>
          <Row k="Pressure" v={`${node.pressurePsi.toFixed(0)} PSI (${(node.pressurePsi / 14.504).toFixed(1)} bar)`} />
          <Row k="Elevation" v={`${node.elevationM} m`} />
          {node.type === 'DemandPoint' && <Row k="Demand" v={`${node.demandGPM.toFixed(0)} GPM (base ${node.baseDemandGPM})`} />}
          {node.type === 'DemandPoint' && <Row k="Zone" v={node.zone} />}
          {node.type === 'Reservoir' && <Row k="Level" v={`${node.levelPct.toFixed(0)}% (${(node.volumeGal / 1000).toFixed(0)}k gal)`} />}
          {node.type === 'Reservoir' && <Row k="Inflow / outflow" v={`${node.inflowGPM.toFixed(0)} / ${node.outflowGPM.toFixed(0)} GPM`} />}
          {(node.type === 'PumpStation' || node.type === 'TreatmentPlant') && <Row k="Load" v={`${node.loadPct.toFixed(0)}% of ${node.ratedGPM} GPM`} />}
          {node.type === 'PumpStation' && <Row k="Status" v={node.online ? 'Online' : 'Offline'} />}
          {node.type === 'PumpStation' && (
            <button className="mt-2 w-full rounded border border-amber-500/60 bg-amber-500/10 px-2 py-1 text-amber-300" onClick={() => onTogglePump(node.id)}>
              {node.online ? 'Trip pump (simulate fault)' : 'Restore pump'}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

export { Droplets };