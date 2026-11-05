// @ts-nocheck
import { useSyncExternalStore } from 'react';
import { NETWORK } from './network';
import { CATEGORIES } from './assumptions';

let state = { category: 'A', compliance: 0.5, current: 1 };
let sim: any = null;
let timer: any = null;
const subs = new Set<() => void>();
const emit = () => { state = { ...state }; subs.forEach((l) => l()); };

export const targetSaving = (cat: string) => (CATEGORIES.find((c) => c.id === cat) || CATEGORIES[0]).target;
export const targetFactor = (s = state) => 1 - targetSaving(s.category) * s.compliance;

export const getScarcityState = () => state; export function useScarcity() {
  return useSyncExternalStore((l) => { subs.add(l); return () => { subs.delete(l); }; }, () => state, () => state);
}
export function setCategory(id: string) {
  if (!CATEGORIES.some((c) => c.id === id)) return;
  state.category = id;
  emit();
}
export function setCompliance(v: number) {
  state.compliance = Math.min(1, Math.max(0, v));
  emit();
}
export function scarcitySummary() {
  const c = CATEGORIES.find((x) => x.id === state.category) || CATEGORIES[0];
  return 'Water scarcity scenario: Category ' + c.id + ' (' + c.name + '). City saving target ' + Math.round(c.target * 100) + '%. Assumed resident compliance ' + Math.round(state.compliance * 100) + '%, so actual saving about ' + (c.target * state.compliance * 100).toFixed(1) + '%. This is a scenario setting in the simulation. Category saving targets come from news reports citing the City plan.';
}

function applyDemand() {
  if (!sim) return;
  const tgt = targetFactor();
  if (Math.abs(state.current - tgt) > 0.0005) {
    const step = Math.min(0.01, Math.abs(tgt - state.current));
    state.current += tgt > state.current ? step : -step;
    emit();
  }
  for (const f of NETWORK.features) {
    const p: any = f.properties;
    if (p.kind !== 'node' || p.nodeType !== 'DemandPoint') continue;
    const n = sim.getNode(p.id);
    const want = (p.baseDemandGPM || 0) * state.current;
    if (n && Math.abs(n.baseDemandGPM - want) > 0.01) n.baseDemandGPM = want;
  }
}

function detach() {
  if (timer) clearInterval(timer);
  timer = null;
  sim = null;
}
export function attachScarcity(s: any) {
  detach();
  sim = s;
  timer = setInterval(applyDemand, 1000);
  applyDemand();
  return detach;
}