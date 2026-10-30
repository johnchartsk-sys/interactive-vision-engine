// @ts-nocheck
import { useSyncExternalStore } from 'react';
import { getAsset, selectAsset } from './assetBus';
import { faults, createWorkOrder } from './assetData';
import { runMapCommand } from './mapBus';

export type LogEntry = { key: number; time: string; level: string; asset: string; code: string; lines: string[] };

let log: LogEntry[] = [];
let counter = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());
const timers: Record<string, any> = {};
const active = new Set<string>();

export function useLog(): LogEntry[] {
  return useSyncExternalStore(
    (l) => { subs.add(l); return () => { subs.delete(l); }; },
    () => log,
    () => log,
  );
}

export function isFaulted(id: string) { return active.has(id); }

function push(level: string, asset: string, code: string, lines: string[]) {
  const time = new Date().toISOString().substr(11, 8) + ' UTC';
  log = [{ key: ++counter, time, level, asset, code, lines }, ...log].slice(0, 30);
  emit();
}

function entityOf(id: string) {
  const v = (window as any).__niaViewer;
  if (!v || (v.isDestroyed && v.isDestroyed())) return null;
  const ds = v.dataSources.getByName('rail')[0];
  return ds ? ds.entities.getById(id) : null;
}

// called when a new map is created, so old fault state cannot leak into it
export function resetFaults() {
  Object.keys(timers).forEach((k) => clearInterval(timers[k]));
  active.clear();
  Object.keys(faults).forEach((k) => delete faults[k]);
}

export function triggerFault(id: string) {
  const Cesium = (window as any).Cesium;
  const asset = getAsset(id);
  const ent = entityOf(id);
  if (!Cesium || !asset || !ent || active.has(id)) return false;
  active.add(id);

  const t0 = Date.now();
  clearInterval(timers[id]);
  timers[id] = setInterval(() => {
    const p = Math.min(1, (Date.now() - t0) / 2000);
    faults[id] = { axleTemp: 60 + 55 * p };
    if (p >= 1) clearInterval(timers[id]);
  }, 100);

  const red = Cesium.Color.fromCssColorString('#ef4444');
  const dark = Cesium.Color.fromCssColorString('#7f1d1d');
  ent.point.color = new Cesium.CallbackProperty(() => (Math.floor(Date.now() / 350) % 2 ? red : dark), false);
  ent.label.text = '\u26a0 FAULT: AXLE 3 OVERHEAT (115 \u00b0C)';
  ent.label.fillColor = Cesium.Color.fromCssColorString('#fecaca');
  ent.label.backgroundColor = Cesium.Color.fromCssColorString('#7f1d1dcc');
  ent.label.font = 'bold 14px sans-serif';

  createWorkOrder(id, 'Bearing inspection (fault-triggered)');
  push('ALERT: CRITICAL', id, 'SIM-E403', [
    '\u25b6 ' + asset.name + ' reports axle 3 bearing temperature over threshold (current: 115 \u00b0C, limit: 90 \u00b0C assumed).',
    '\u25b6 ACTION (simulated): emergency speed restriction of 30 km/h sent to cab. Dispatch field crew to the nearest siding (siding data not modelled yet).',
  ]);
  selectAsset(id);
  runMapCommand({ action: 'follow_train', place: String(asset.trainNo || 1) });
  return true;
}

export function clearFault(id: string) {
  const Cesium = (window as any).Cesium;
  if (!active.has(id)) return;
  active.delete(id);
  clearInterval(timers[id]);
  delete faults[id];
  const asset = getAsset(id);
  const ent = entityOf(id);
  if (Cesium && ent) {
    ent.point.color = Cesium.Color.fromCssColorString('#22d3ee');
    ent.label.text = 'SIM TRAIN ' + ((asset && asset.trainNo) || '');
    ent.label.fillColor = Cesium.Color.WHITE;
    ent.label.backgroundColor = Cesium.Color.fromCssColorString('#04162488');
    ent.label.font = '12px sans-serif';
  }
  runMapCommand({ action: 'stop_following' });
  push('INFO', id, 'SIM-OK', ['\u25b6 Simulated fault cleared. Axle temperature returning to normal.']);
}