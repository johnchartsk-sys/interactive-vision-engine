import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Droplets, Pause, Play, Radio, RotateCcw } from 'lucide-react';
import { useWaterSim } from './useWaterSim';
import { CesiumPipelineViewer } from './CesiumPipelineViewer';
import { AlertsPanel, AssetGrid, ConditionPanel, ConsumptionChart, GaugesPanel, Inspector, MaintenancePanel } from './panels';
import { IncidentPopup, NiaWatchPanel } from './AgentPanel';
import { runWaterCommand, startAgent, useAgent, waterSummary } from './agent';
import { NiaChat } from '@/components/NiaChat';

const SPEEDS: Array<[number, string]> = [[6, '1x'], [15, '2.5x'], [30, '5x']];

export function WaterDashboard() {
  const { sim, snap } = useWaterSim();
  const ag = useAgent();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [niaOpen, setNiaOpen] = useState(false);

  const select = (id: string | null, fly = false) => {
    setSelectedId(id);
    if (id && fly) setFocus({ id, n: Date.now() });
  };

  useEffect(() => startAgent(sim), [sim]);

  useEffect(() => {
    const h = (e: any) => {
      const d = (e && e.detail) || {};
      const id = runWaterCommand(sim, d.action, d.place);
      if (d.action === 'water_focus' && id) select(id, true);
    };
    window.addEventListener('nia-water', h);
    return () => window.removeEventListener('nia-water', h);
  }, [sim]);

  const selEdge = snap.edges.find((e) => e.id === selectedId);
  const selNode = snap.nodes.find((n) => n.id === selectedId);
  const selTicket = selEdge ? snap.tickets.find((t) => t.assetId === selEdge.id && t.status !== 'Done' && t.priority === 'Emergency') : undefined;
  const activeAlerts = snap.alerts.filter((a) => a.active && a.severity === 'critical').length;

  return (
    <div className="fixed inset-0 z-[100] overflow-auto bg-slate-950 text-slate-100">
      <IncidentPopup onSelect={(id: string) => select(id, true)} />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/20 bg-slate-900/80 px-4 py-2">
        <div className="flex items-center gap-3">
          <Droplets className="text-cyan-300" size={22} />
          <div>
            <h1 className="text-lg font-bold tracking-wide text-slate-100">NamTwin Water</h1>
            <div className="text-[10px] text-slate-400">5D digital twin prototype {'\u00b7'} <span className="font-bold text-amber-300">SIMULATED</span> illustrative network, not City of Windhoek asset data</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded border border-slate-600 px-2 py-1 font-mono text-slate-200">{snap.dayLabel} {'\u00b7'} {snap.clockLabel}</span>
          <button className="flex items-center gap-1 rounded border border-cyan-500/50 px-2 py-1 text-cyan-300" onClick={() => sim.togglePlay()}>
            {snap.running ? <Pause size={13} /> : <Play size={13} />}{snap.running ? 'Pause' : 'Play'}
          </button>
          {SPEEDS.map(([m, label]) => (
            <button key={m} className={`rounded border px-2 py-1 ${snap.minutesPerTick === m ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200' : 'border-slate-600 text-slate-300'}`} onClick={() => sim.setSpeed(m)}>{label}</button>
          ))}
          <button className="rounded border border-red-500/60 bg-red-500/10 px-2 py-1 text-red-300" onClick={() => { sim.triggerBreak(); }}>Simulate main break</button>
          <button className="flex items-center gap-1 rounded border border-slate-600 px-2 py-1 text-slate-300" onClick={() => { sim.reset(); setSelectedId(null); }}><RotateCcw size={13} />Reset</button>
          <button className="flex items-center gap-1 rounded border border-cyan-500/50 bg-cyan-500/10 px-2 py-1 text-cyan-300" onClick={() => setNiaOpen(true)}><Radio size={13} />NIA</button>
          <Link to="/" className="rounded border border-slate-600 px-2 py-1 text-slate-300">Command center</Link>
        </div>
      </header>

      <main className="grid gap-3 p-3 xl:h-[calc(100vh-64px)] xl:grid-cols-[330px_minmax(0,1fr)_350px]">
        <div className="space-y-3 xl:overflow-y-auto xl:pr-1">
          <GaugesPanel kpi={snap.kpi} />
          <ConsumptionChart history={snap.history} />
          <ConditionPanel kpi={snap.kpi} />
          <NiaWatchPanel onSelect={(id: string) => select(id, true)} />
        </div>

        <div className="relative h-[62vh] min-h-[420px] overflow-hidden rounded-xl border border-cyan-500/30 xl:h-full">
          <CesiumPipelineViewer sim={sim} selectedId={selectedId} onSelect={(id) => select(id)} focus={focus} />
          <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg bg-slate-950/85 px-3 py-2 text-[11px] text-slate-200">
            <div className="font-semibold text-cyan-300">Legend</div>
            <div><span className="text-cyan-400">{'\u25ac'}</span> normal {'\u00b7'} <span className="text-amber-400">{'\u25ac'}</span> poor {'\u00b7'} <span className="text-orange-400">{'\u25ac'}</span> critical {'\u00b7'} <span className="text-red-400">{'\u25ac'}</span> break</div>
            <div className="text-slate-400">Click any pipe or node to inspect. {activeAlerts > 0 && <span className="text-red-300">{activeAlerts} critical alert(s)</span>}</div>
          </div>
          <Inspector
            edge={selEdge} node={selNode} ticket={selTicket}
            onClose={() => select(null)} onBreak={(id) => sim.triggerBreak(id)}
            onDispatch={(id) => sim.dispatchCrew(id)} onTogglePump={(id) => sim.togglePump(id)}
          />
        </div>

        <div className="space-y-3 xl:overflow-y-auto xl:pr-1">
          <AlertsPanel alerts={snap.alerts} leaks={snap.leaks} kpi={snap.kpi} onSelect={(id) => select(id, true)} onAck={(id) => sim.acknowledge(id)} />
          <MaintenancePanel tickets={snap.tickets} onSelect={(id) => select(id, true)} onDispatch={(id) => sim.dispatchCrew(id)} />
          <AssetGrid nodes={snap.nodes} onSelect={(id) => select(id, true)} onTogglePump={(id) => sim.togglePump(id)} />
          <p className="px-1 pb-4 text-[10px] leading-snug text-slate-500">
            Simplified hydraulics (tree network, Hazen-Williams friction, gravity-fed pressure from reservoir level, pump boost). Not a calibrated model.
            All values are simulated. Units: GPM and PSI.
          </p>
        </div>
      </main>

      {niaOpen && <NiaChat dashboard={waterSummary(snap, ag.incidents)} onClose={() => setNiaOpen(false)} onRecommendation={() => {}} />}
    </div>
  );
}