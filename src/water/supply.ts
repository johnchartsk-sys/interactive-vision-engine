// @ts-nocheck
import { useSyncExternalStore } from 'react';
import { ASSUMPTIONS, CATEGORIES } from './assumptions';
import { getScarcityState, setCategory } from './scarcity';
import { raiseIncident, resolveByKey } from './agent';

const B = 800; // baseline demand in GPM (project target, assumed)
const CAP = { nam: 1.2, rec: 0.25, bore: 0.45 }; // capacity as a fraction of B (assumed)
const BASE = { nam: 0.77, rec: 0.21, bore: 0.02 }; // reported 2021 mix
const INJECT_CAP = 0.1; // aquifer injection capacity, fraction of B (assumed)
const AQ_GAL = 20 * 1440 * B; // aquifer operating storage: 20 days of baseline demand (assumed)
const RAMP = { rec: 0.02, bore: 0.03 }; // ramp rate, fraction of B per second (assumed)

export const SOURCES = [
  { key: 'nam', label: 'NamWater (dams, bulk pipeline)', color: '#38bdf8', cap: CAP.nam * B },
  { key: 'rec', label: 'Reclaimed water (WINGOC)', color: '#2dd4bf', cap: CAP.rec * B },
  { key: 'bore', label: 'Windhoek aquifer boreholes', color: '#fbbf24', cap: CAP.bore * B },
];

const NOTES = [
  { topic: 'Supply mix in normal operation', value: 'NamWater 77%, reclaimed 21%, aquifer 2%', confidence: 'reported', source: 'Reported mix for 2021 (We.com.na, May 2022). Other years differ: about 79/20/1 in 2026 (AllAfrica, April 2026) and about 66/26/7 in 2018 (Atlas of Namibia).' },
  { topic: 'Source capacities (fraction of baseline demand)', value: 'NamWater 120%, reclaimed 25%, boreholes 45%', confidence: 'assumed', source: 'Chosen so the City-managed sources total 70%, matching a report that the reclamation plant and aquifer carry about 70% under Category D (NBC News).' },
  { topic: 'Aquifer storage and injection', value: 'Operating storage 20 days of demand, injection 10% of demand', confidence: 'assumed', source: 'Simplified water-bank model.' },
  { topic: 'Source ramp rates', value: 'Reclamation 2% and boreholes 3% of demand per second (wall clock)', confidence: 'assumed', source: 'Simplified spin-up lag.' },
  { topic: 'Von Bach dam and the bulk pipeline', value: 'Owned and managed by NamWater, not the City', confidence: 'reported', source: 'The Windhoek Observer, September 2023.' },
];
for (const n of NOTES) if (!ASSUMPTIONS.some((a) => a.topic === n.topic)) ASSUMPTIONS.push(n);

function fresh() {
  return {
    init: false, namOnline: true, auto: true, autoDeclared: false, prevCat: 'A',
    actual: { nam: 0, rec: 0, bore: 0 }, target: { nam: 0, rec: 0, bore: 0 },
    aquiferPct: 80, mode: 'Standby', injectGPM: 0, requested: 0, supplied: 0, factor: 1,
    need: 0, capacity: 0, recommended: '', beyond: false, events: [],
  };
}
let S: any = fresh();
let sim: any = null;
let timer: any = null;
let lastClock: any = null;
const subs = new Set<() => void>();

function emit() {
  S = { ...S, actual: { ...S.actual }, target: { ...S.target }, events: [...S.events] };
  subs.forEach((l) => l());
}
export function useSupply() {
  return useSyncExternalStore((l) => { subs.add(l); return () => { subs.delete(l); }; }, () => S, () => S);
}
function event(text: string) {
  S.events = [{ time: new Date().toTimeString().slice(0, 8), text }, ...S.events].slice(0, 6);
}

function recommend(need: number, capacity: number) {
  const sc = getScarcityState();
  const unrestricted = need / Math.max(0.05, sc.current);
  const saving = Math.max(0, 1 - capacity / unrestricted);
  const hit = CATEGORIES.find((c) => c.target >= saving - 1e-9);
  return { id: hit ? hit.id : 'E', beyond: !hit, saving };
}

function step() {
  if (!sim) return;
  const snap = sim.getSnapshot();
  const k = snap.kpi;
  const applied = sim.supplyFactor == null ? 1 : sim.supplyFactor;
  const req = Math.max(50, k.supplyGPM / Math.max(0.05, applied)); // what the network asks for
  const need = k.demandGPM + k.leakageGPM;
  const res = snap.nodes.filter((n: any) => n.type === 'Reservoir');
  const avgRes = res.length ? res.reduce((t: number, n: any) => t + n.levelPct, 0) / res.length : 100;

  if (!S.init) { S.actual = { nam: BASE.nam * req, rec: BASE.rec * req, bore: BASE.bore * req }; S.init = true; }

  // dispatch rule: reclaimed water is base-loaded, NamWater fills the rest, boreholes stay on standby.
  // During a NamWater outage: reclaimed to maximum, boreholes make up the rest, up to their limits.
  const t = { nam: 0, rec: 0, bore: 0 };
  let inject = 0;
  if (S.namOnline) {
    t.rec = Math.min(CAP.rec * B, BASE.rec * req);
    t.bore = Math.min(CAP.bore * B, BASE.bore * req);
    t.nam = Math.min(CAP.nam * B, Math.max(0, req - t.rec - t.bore));
    const headroom = CAP.nam * B - t.nam;
    if (S.aquiferPct < 95 && avgRes >= 60 && headroom > 0) inject = Math.min(INJECT_CAP * B, headroom);
  } else {
    t.rec = CAP.rec * B;
    t.bore = S.aquiferPct > 3 ? Math.min(CAP.bore * B, Math.max(0, req - t.rec)) : 0;
  }

  const a = S.actual;
  a.nam = t.nam;
  for (const key of ['rec', 'bore']) {
    const diff = t[key] - a[key];
    a[key] += Math.sign(diff) * Math.min(Math.abs(diff), RAMP[key] * B);
  }
  const supplied = a.nam + a.rec + a.bore;
  const factor = supplied >= req * 0.995 ? 1 : Math.max(0, supplied / req);
  sim.supplyFactor = factor; // the engine scales reservoir inflow by this

  // aquifer water bank, integrated over simulated minutes
  const dtMin = lastClock !== null && snap.clockMin > lastClock ? Math.min(180, snap.clockMin - lastClock) : 0;
  lastClock = snap.clockMin;
  S.aquiferPct = Math.min(100, Math.max(0, S.aquiferPct + (100 * (inject - a.bore) * dtMin) / AQ_GAL));
  const mode = inject > 1 ? 'Injection' : a.bore > BASE.bore * req * 1.5 + 5 ? 'Abstraction' : 'Standby';
  if (mode !== S.mode) event('Aquifer mode: ' + mode + '.');
  S.mode = mode;
  S.injectGPM = inject;

  const capacity = t.rec + t.bore;
  let rec = { id: 'A', beyond: false, saving: 0 };
  if (!S.namOnline) {
    rec = recommend(need, capacity);
    if (S.auto) {
      const cur = getScarcityState().category;
      const iCur = CATEGORIES.findIndex((c) => c.id === cur);
      const iRec = CATEGORIES.findIndex((c) => c.id === rec.id);
      if (iRec > iCur) {
        if (!S.autoDeclared) { S.prevCat = cur; S.autoDeclared = true; }
        setCategory(rec.id);
        event('NIA Watch declared Category ' + rec.id + ' (simulated declaration) to cut demand.');
      }
    }
  }
  S.target = t; S.requested = req; S.supplied = supplied; S.factor = factor;
  S.need = need; S.capacity = capacity; S.recommended = S.namOnline ? '' : rec.id; S.beyond = rec.beyond;
  emit();
}

export function failNamWater() {
  if (!sim || !S.namOnline) return;
  S.namOnline = false;
  const k = sim.getSnapshot().kpi;
  const need = k.demandGPM + k.leakageGPM;
  const cap = (CAP.rec + CAP.bore) * B;
  const cover = Math.min(1, cap / Math.max(1, need));
  const rec = recommend(need, cap);
  event('NamWater bulk supply lost (simulated Von Bach pipeline failure). Re-blending: reclamation to maximum, boreholes spinning up.');
  raiseIncident({
    key: 'supply:namwater', severity: 'critical', assetId: 'R-1',
    title: 'NamWater bulk supply failure (Von Bach pipeline, simulated)',
    where: 'NamWater bulk pipeline from the central-area dams to Windhoek. This is an external supplier asset, not a City of Windhoek pipe.',
    impact: 'Bulk supply from the dams is lost (about ' + Math.round(BASE.nam * 100) + '% of the normal mix). City-managed sources (reclaimed water and boreholes) can cover about ' + Math.round(cover * 100) + '% of current need. Expected shortfall about ' + Math.round((1 - cover) * 100) + '%. Reservoirs will drain.',
    urgency: 'CRITICAL: the supply gap grows every hour',
    cause: 'External event at NamWater (simulated).',
    advice: [
      'NIA Watch has re-blended: reclamation to maximum and boreholes spinning up (capacities are assumptions).',
      'Recommended scarcity category: ' + rec.id + (rec.beyond ? ', and even that is not enough, so plan emergency measures such as tankers or rationing.' : '.') + ' Saving depends on resident compliance.',
      'Notify NamWater and the City water control room, and ask for the repair time.',
    ],
  });
  emit();
}
export function restoreNamWater() {
  if (!sim || S.namOnline) return;
  S.namOnline = true;
  event('NamWater bulk supply restored (simulated).');
  if (S.autoDeclared) {
    setCategory(S.prevCat);
    S.autoDeclared = false;
    event('Scarcity category returned to ' + S.prevCat + '.');
  }
  resolveByKey('supply:namwater', 'NamWater supply restored (simulated).');
  emit();
}
export function setAuto(v: boolean) { S.auto = v; emit(); }

export function supplySummary() {
  const tot = S.actual.nam + S.actual.rec + S.actual.bore || 1;
  const p = (v: number) => Math.round((100 * v) / tot) + '%';
  return 'Supply mix (SIMULATED): NamWater (dams, bulk pipeline) ' + p(S.actual.nam) + ' ' + (S.namOnline ? 'online' : 'OUTAGE') + ', reclaimed water (WINGOC) ' + p(S.actual.rec) + ', Windhoek aquifer boreholes ' + p(S.actual.bore) + '. Aquifer storage ' + S.aquiferPct.toFixed(0) + '% (' + S.mode + '). Supply covers ' + Math.round(S.factor * 100) + '% of what the network asks for.' + (S.recommended ? ' Recommended scarcity category: ' + S.recommended + '.' : '');
}

function detach() {
  if (timer) clearInterval(timer);
  timer = null;
  if (sim) sim.supplyFactor = 1;
  sim = null;
}
export function attachSupply(s: any) {
  detach();
  S = fresh();
  lastClock = null;
  sim = s;
  timer = setInterval(step, 1000);
  step();
  return detach;
}