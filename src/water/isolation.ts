// @ts-nocheck
import { ASSUMPTIONS } from './assumptions';

const NOTES = [
  { topic: 'Emergency interconnects E-11 and E-12', value: 'Normally closed: E-11 (D-4 to D-3, 300 GPM), E-12 (D-5 to D-2, 350 GPM)', confidence: 'invented', source: 'Invented to demonstrate re-routing. Not City of Windhoek assets.' },
  { topic: 'Valve operation', value: 'Valves open and close instantly', confidence: 'assumed', source: 'Simplified. Real valves close slowly to avoid surges, and this model does not simulate water hammer.' },
  { topic: 'Isolation plan', value: 'Close the broken pipe, then open the interconnect that leaves the fewest zones dry', confidence: 'assumed', source: 'Rule-based what-if analysis, not a trained model. A human approves the plan.' },
];
for (const n of NOTES) if (!ASSUMPTIONS.some((a) => a.topic === n.topic)) ASSUMPTIONS.push(n);

// Re-orient the open pipes into a tree rooted at the treatment plant, so valve changes re-route supply.
export function rebuild(sim: any) {
  sim.children.clear();
  sim.parentEdge.clear();
  const adj = new Map();
  for (const e of sim.edges.values()) {
    if (e.closed) continue;
    for (const id of [e.from, e.to]) { const l = adj.get(id) || []; l.push(e); adj.set(id, l); }
  }
  const seen = new Set([sim.rootId]);
  const inTree = new Set();
  const queue = [sim.rootId];
  while (queue.length) {
    const cur = queue.shift();
    for (const e of adj.get(cur) || []) {
      const other = e.from === cur ? e.to : e.from;
      if (seen.has(other)) continue;
      seen.add(other);
      if (e.to === cur) { const t = e.to; e.to = e.from; e.from = t; e.coords = [...e.coords].reverse(); }
      const list = sim.children.get(cur) || [];
      list.push(e);
      sim.children.set(cur, list);
      sim.parentEdge.set(e.to, e);
      inTree.add(e.id);
      queue.push(other);
    }
  }
  for (const e of sim.edges.values()) if (!inTree.has(e.id)) { e.currentFlow = 0; e.currentPressure = 0; e.utilisation = 0; }
  for (const n of sim.nodes.values()) if (!seen.has(n.id)) { n.pressurePsi = 0; n.headM = 0; n.inflowGPM = 0; n.outflowGPM = 0; }
}

export function setValves(sim: any, changes: Record<string, boolean>) {
  for (const id of Object.keys(changes)) {
    const e = sim.edges.get(id);
    if (!e) continue;
    e.closed = !!changes[id];
    e.repairHold = e.closed && e.status === 'broken';
    if (e.closed) { e.currentFlow = 0; e.currentPressure = 0; e.utilisation = 0; e.leakGPM = 0; }
  }
  rebuild(sim);
  sim.refresh();
}

export function restoreValves(sim: any) {
  for (const e of sim.edges.values()) { e.closed = !!e.nc; e.repairHold = false; if (e.closed) { e.currentFlow = 0; e.currentPressure = 0; e.utilisation = 0; } }
  rebuild(sim);
  sim.refresh();
}

// After a repair, reopen the isolated pipe and close the emergency interconnects again.
export function autoRestore(sim: any) {
  const edges = sim.getSnapshot().edges;
  const repaired = edges.filter((e: any) => e.closed && !e.nc && e.repairHold && e.status !== 'broken');
  if (!repaired.length) return;
  const changes: any = {};
  for (const e of repaired) changes[e.id] = false;
  const holdOthers = edges.some((e: any) => e.closed && !e.nc && !(e.id in changes));
  if (!holdOthers) for (const e of edges) if (e.nc && !e.closed) changes[e.id] = true;
  setValves(sim, changes);
}

function reach(s: any, closed: Set<string>) {
  const root = s.nodes.find((n: any) => n.type === 'TreatmentPlant');
  const adj = new Map();
  for (const e of s.edges) {
    if (closed.has(e.id)) continue;
    for (const id of [e.from, e.to]) { const l = adj.get(id) || []; l.push(e); adj.set(id, l); }
  }
  const seen = new Set([root.id]);
  const q = [root.id];
  while (q.length) {
    const c = q.shift();
    for (const e of adj.get(c) || []) { const o = e.from === c ? e.to : e.from; if (!seen.has(o)) { seen.add(o); q.push(o); } }
  }
  return seen;
}

// What-if analysis: which valves to operate, and which zones are left without water.
export function isolationPlan(edgeId: string, s: any) {
  const e = s.edges.find((x: any) => x.id === edgeId);
  if (!e) return null;
  const zones = s.nodes.filter((n: any) => n.type === 'DemandPoint');
  const closedNow = new Set<string>(s.edges.filter((x: any) => x.closed).map((x: any) => x.id));
  const cut = (closed: Set<string>) => { const r = reach(s, closed); return zones.filter((z: any) => !r.has(z.id)); };
  const names = (l: any[]) => l.map((z) => z.name).join(', ') || 'none';
  const dem = (l: any[]) => l.reduce((t, z) => t + z.demandGPM, 0);

  if (closedNow.has(edgeId)) {
    const now = cut(closedNow);
    return { edgeId, close: [], open: [], after: now.map((z: any) => z.id), advice: ['Isolation in place (simulated): ' + e.id + ' is closed' + (e.leakGPM < 1 ? ' and the loss has stopped' : '') + '. Zones without water now: ' + names(now) + '.'] };
  }

  const leak = e.leakGPM;
  const closedB = new Set(closedNow);
  closedB.add(edgeId);
  const cutB = cut(closedB);
  let best: any = null;
  for (const x of s.edges) {
    if (!x.nc || !closedNow.has(x.id) || x.id === edgeId) continue;
    const c2 = new Set(closedB);
    c2.delete(x.id);
    const left = cut(c2);
    const moved = cutB.filter((z: any) => !left.includes(z));
    if (!moved.length) continue;
    const ok = x.capacityGPM >= dem(moved);
    if (!best || (ok && !best.ok) || (ok === best.ok && left.length < best.left.length)) best = { x, left, moved, ok };
  }
  const useIc = !!(best && best.ok);
  const after = useIc ? best.left : cutB;

  if (cutB.length >= zones.length && !useIc) {
    return { edgeId, close: [], open: [], after: cutB.map((z: any) => z.id), advice: ['Do not isolate ' + edgeId + ': it feeds every zone, so closing it would cut supply to all of them. Repair under pressure or arrange emergency supply.'] };
  }

  const advice = [];
  advice.push('Recommended plan (what-if analysis): close ' + edgeId + ' to isolate the break' + (useIc ? ', then open emergency interconnect ' + best.x.id + ' (' + best.x.name + ').' : '.'));
  advice.push('Result: ' + (leak >= 1 ? 'the ' + Math.round(leak) + ' GPM loss stops. ' : '') + 'Zones left without water: ' + names(after) + (after.length ? ' (' + Math.round(dem(after)) + ' GPM of demand).' : (useIc ? '. Supply to ' + names(best.moved) + ' is re-routed.' : '.')));
  if (!useIc && cutB.length) advice.push('No usable emergency route for ' + names(cutB) + (best && !best.ok ? ': interconnect ' + best.x.id + ' is too small for that demand' : '') + ', so they stay dry until the repair is done.');
  advice.push('Do nothing instead: the leak keeps losing ' + Math.round(leak) + ' GPM and ' + names(cutB) + ' stay at reduced pressure.');
  return { edgeId, close: [edgeId], open: useIc ? [best.x.id] : [], after: after.map((z: any) => z.id), advice };
}

export function applyPlan(sim: any, plan: any) {
  const changes: any = {};
  for (const id of plan.close) changes[id] = true;
  for (const id of plan.open) changes[id] = false;
  if (Object.keys(changes).length) setValves(sim, changes);
}