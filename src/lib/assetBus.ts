import { useSyncExternalStore } from 'react';

export type Asset = {
  id: string;
  kind: 'train' | 'track';
  name: string;
  simulated: boolean;
  props: [string, string][];
  trainNo?: number;
  live?: () => [string, string][];
};

const registry = new Map<string, Asset>();
let selectedId: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function registerAsset(a: Asset) { registry.set(a.id, a); }
export function getAsset(id: string) { return registry.get(id); }
export function getSelectedId() { return selectedId; }
export function selectAsset(id: string | null) {
  if (id !== selectedId) { selectedId = id; emit(); }
}
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function useSelectedAsset(): Asset | null {
  const id = useSyncExternalStore(subscribe, () => selectedId, () => null);
  return id ? registry.get(id) ?? null : null;
}