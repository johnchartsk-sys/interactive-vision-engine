import type { EdgeKind, LonLat, NetworkCollection, NodeType, PipeMaterial } from './types';
import { isEdgeFeature, isNodeFeature } from './types';

export const TARGET_PRESSURE_PSI = 65;
export const TARGET_DEMAND_GPM = 800;
const PSI_PER_M = 1.4223;
const HW_C: Record<PipeMaterial, number> = { 'Ductile Iron': 130, PVC: 150, HDPE: 150 };
const BREAK_DROP_M = 22;
const HISTORY_MAX = 240;
const START_MIN = 6 * 60;

export type Severity = 'info' | 'warning' | 'critical';
export type PipeStatus = 'normal' | 'poor' | 'critical' | 'broken';
export type ConditionClass = 'Good' | 'Fair' | 'Poor' | 'Critical';
export type TicketStatus = 'Open' | 'Crew dispatched' | 'Repairing' | 'Done';

export interface NodeState {
  id: string; name: string; type: NodeType; lon: number; lat: number; elevationM: number;
  pressurePsi: number; headM: number; demandGPM: number; inflowGPM: number; outflowGPM: number;
  capacityGal: number; volumeGal: number; levelPct: number; tankDepthM: number;
  online: boolean; loadPct: number; ratedGPM: number; pumpHeadM: number; baseDemandGPM: number;
  zone: string; uptime: boolean[]; uptimePct: number; health: 'ok' | 'warn' | 'alert' | 'down';
}
export interface EdgeState {
  id: string; name: string; kind: EdgeKind; from: string; to: string; diameterMm: number; material: PipeMaterial;
  capacityGPM: number; lengthM: number; condition: number; conditionClass: ConditionClass; status: PipeStatus;
  currentFlow: number; currentPressure: number; leakGPM: number; breakLeakGPM: number; utilisation: number;
  brokenAtMin: number; coords: LonLat[];
}
export interface Alert {
  id: string; seq: number; key: string; severity: Severity; assetId: string; message: string;
  time: string; resolvedAt: string; acknowledged: boolean; active: boolean; expiresTick: number;
}
export interface Ticket {
  id: string; assetId: string; task: string; priority: 'Emergency' | 'Routine';
  status: TicketStatus; progress: number; age: number; doneAge: number;
}
export interface LeakEntry { assetId: string; name: string; gpm: number; type: string; since: string }
export interface HistoryPoint { clockMin: number; demand: number; supply: number; pressure: number }
export interface Kpi {
  pressurePsi: number; demandGPM: number; supplyGPM: number; leakageGPM: number; nrwPct: number; health: number;
  counts: Record<ConditionClass, number>; km: Record<ConditionClass, number>;
}
export interface Snapshot {
  version: number; running: boolean; minutesPerTick: number; clockMin: number; clockLabel: string; dayLabel: string;
  nodes: NodeState[]; edges: EdgeState[]; alerts: Alert[]; tickets: Ticket[]; leaks: LeakEntry[];
  history: HistoryPoint[]; kpi: Kpi;
}

export const fmtClock = (min: number): string => {
  const m = ((Math.floor(min) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};
export const classify = (c: number): ConditionClass => (c >= 75 ? 'Good' : c >= 50 ? 'Fair' : c >= 20 ? 'Poor' : 'Critical');

function gauss(h: number, c: number, w: number): number {
  const d = Math.min(Math.abs(h - c), 24 - Math.abs(h - c));
  return Math.exp(-(d * d) / (2 * w * w));
}
/** Diurnal demand multiplier: low at night, peaks around 07:30 and 19:30. */
export function demandFactor(hour: number): number {
  return 0.55 + 0.6 * gauss(hour, 7.5, 1.6) + 0.5 * gauss(hour, 19.5, 2);
}
/** Reservoir pumping schedule: fill at night, ease off at peak, with safety overrides. */
function fillFactor(hour: number, levelPct: number): number {
  let f = hour >= 22 || hour < 5 ? 1.35 : (hour >= 6 && hour < 10) || (hour >= 17 && hour < 21) ? 0.85 : 1.0;
  if (levelPct > 92) f = Math.min(f, 0.6);
  if (levelPct < 30) f = Math.max(f, 1.5);
  return f;
}
function haversineM(a: LonLat, b: LonLat): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export class WaterSimulation {
  readonly network: NetworkCollection;
  private nodes = new Map<string, NodeState>();
  private edges = new Map<string, EdgeState>();
  private children = new Map<string, EdgeState[]>();
  private parentEdge = new Map<string, EdgeState>();
  private rootId = '';
  private clockMin = START_MIN;
  private minutesPerTick = 6;
  private running = true;
  private tickCount = 0;
  private history: HistoryPoint[] = [];
  private alerts = new Map<string, Alert>();
  private alertSeq = 0;
  private tickets: Ticket[] = [];
  private ticketSeq = 0;
  private hourIdx = 0;
  private downThisHour = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private version = 0;
  private snap!: Snapshot;

  constructor(network: NetworkCollection) {
    this.network = network;
    this.load();
  }

  // ---- external store API (React) ----
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = () => this.snap;
  getNode = (id: string) => this.nodes.get(id);
  getEdge = (id: string) => this.edges.get(id);

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { if (this.running) this.tick(); }, 1000);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ---- controls ----
  togglePlay() { this.running = !this.running; this.publish(); }
  setSpeed(minutesPerTick: number) { this.minutesPerTick = minutesPerTick; this.publish(); }
  reset() { this.load(); }
  triggerBreak(id?: string) { this.doBreak(id); this.refresh(); }
  togglePump(id: string) {
    const n = this.nodes.get(id);
    if (!n || n.type !== 'PumpStation') return;
    n.online = !n.online;
    this.refresh();
  }
  dispatchCrew(ticketId: string) {
    const t = this.tickets.find((x) => x.id === ticketId);
    if (t && t.status === 'Open') {
      t.status = 'Crew dispatched';
      t.age = Math.max(t.age, t.priority === 'Emergency' ? 6 : 24);
      this.publish();
    }
  }
  acknowledge(alertId: string) {
    for (const a of this.alerts.values()) if (a.id === alertId) a.acknowledged = true;
    this.publish();
  }

  // ---- loading ----
  private node(id: string): NodeState {
    const n = this.nodes.get(id);
    if (!n) throw new Error('Unknown node ' + id);
    return n;
  }
  private kids(id: string): EdgeState[] { return this.children.get(id) ?? []; }
  private hourNow() { return (this.clockMin / 60) % 24; }
  private statusOf(e: EdgeState): PipeStatus {
    if (e.status === 'broken') return 'broken';
    return e.condition < 20 ? 'critical' : e.condition < 50 ? 'poor' : 'normal';
  }

  private load() {
    this.nodes.clear(); this.edges.clear(); this.children.clear(); this.parentEdge.clear();
    this.alerts.clear(); this.tickets = []; this.alertSeq = 0; this.ticketSeq = 0; this.tickCount = 0;
    this.clockMin = START_MIN; this.downThisHour.clear(); this.hourIdx = Math.floor(START_MIN / 60); this.rootId = '';

    for (const f of this.network.features) {
      if (isNodeFeature(f)) {
        const p = f.properties;
        const [lon, lat] = f.geometry.coordinates;
        const cap = p.capacityGal ?? 0;
        const pct = p.initialPct ?? 0;
        this.nodes.set(p.id, {
          id: p.id, name: p.name, type: p.nodeType, lon, lat, elevationM: p.elevationM,
          pressurePsi: 0, headM: 0, demandGPM: 0, inflowGPM: 0, outflowGPM: 0,
          capacityGal: cap, volumeGal: (cap * pct) / 100, levelPct: pct, tankDepthM: p.tankDepthM ?? 0,
          online: true, loadPct: 0, ratedGPM: p.capacityGPM ?? 0, pumpHeadM: p.pumpHeadM ?? 0,
          baseDemandGPM: p.baseDemandGPM ?? 0, zone: p.zone ?? '',
          uptime: Array.from({ length: 24 }, () => true), uptimePct: 100, health: 'ok',
        });
        if (p.nodeType === 'TreatmentPlant' && !this.rootId) this.rootId = p.id;
      }
    }
    for (const f of this.network.features) {
      if (isEdgeFeature(f)) {
        const p = f.properties;
        const coords = f.geometry.coordinates;
        let len = 0;
        for (let i = 1; i < coords.length; i++) {
          const a = coords[i - 1];
          const b = coords[i];
          if (a && b) len += haversineM(a, b);
        }
        const e: EdgeState = {
          id: p.id, name: p.name, kind: p.edgeType, from: p.from, to: p.to, diameterMm: p.diameterMm, material: p.material,
          capacityGPM: p.capacityGPM, lengthM: len, condition: p.condition, conditionClass: classify(p.condition),
          status: 'normal', currentFlow: 0, currentPressure: 0, leakGPM: 0, breakLeakGPM: 0, utilisation: 0,
          brokenAtMin: 0, coords,
        };
        e.status = this.statusOf(e);
        this.edges.set(p.id, e);
        if (p.normallyClosed) { (e as any).closed = true; (e as any).nc = true; continue; } const list = this.children.get(p.from) ?? [];
        list.push(e);
        this.children.set(p.from, list);
        this.parentEdge.set(p.to, e);
      }
    }

    const hour = START_MIN / 60;
    const f = demandFactor(hour);
    let base = 0;
    for (const n of this.nodes.values()) {
      if (n.type === 'DemandPoint') { n.demandGPM = n.baseDemandGPM * f; base += n.baseDemandGPM; }
    }
    this.solveFlows(hour);
    this.updateBackgroundLeaks();
    this.solveFlows(hour);
    this.solvePressure();
    this.updateAlerts();
    for (const e of this.edges.values()) {
      if (e.condition < 35) this.addTicket(e.id, 'Inspect and renew ' + e.name, 'Routine');
    }
    this.history = [];
    for (let i = 100; i > 0; i--) {
      const cm = START_MIN - i * this.minutesPerTick;
      const d = base * demandFactor((((cm / 60) % 24) + 24) % 24);
      this.history.push({ clockMin: cm, demand: d, supply: d * 1.02, pressure: 64 });
    }
    this.record();
    this.publish();
  }

  // ---- tick loop ----
  private tick() {
    this.tickCount++;
    this.clockMin += this.minutesPerTick;
    const hour = this.hourNow();
    const f = demandFactor(hour);
    for (const n of this.nodes.values()) {
      if (n.type === 'DemandPoint') n.demandGPM = n.baseDemandGPM * f * (0.96 + Math.random() * 0.08);
    }
    this.degrade();
    this.maybeBreak();
    this.updateBackgroundLeaks();
    this.solveFlows(hour);
    this.updateReservoirs();
    this.solvePressure();
    this.updateTickets();
    this.updateAlerts();
    this.updateUptime();
    this.record();
    this.publish();
  }

  private refresh() {
    this.solveFlows(this.hourNow());
    this.solvePressure();
    this.updateAlerts();
    this.publish();
  }

  private degrade() {
    for (const e of this.edges.values()) {
      if (e.status !== 'broken') e.condition = Math.max(0, e.condition - Math.random() * 0.012);
      e.status = this.statusOf(e);
    }
  }

  private maybeBreak() {
    if (this.tickCount < 20) return;
    for (const e of this.edges.values()) {
      if (e.status !== 'broken' && e.condition < 20 && Math.random() < 0.01 + (20 - e.condition) * 0.002) {
        this.doBreak(e.id);
        return;
      }
    }
  }

  /** Water main break: leakage spike, downstream pressure drop (see solvePressure), alert and emergency ticket. */
  private doBreak(id?: string) {
    let e = id ? this.edges.get(id) : undefined;
    if (!e) e = [...this.edges.values()].filter((x) => x.status !== 'broken').sort((a, b) => a.condition - b.condition)[0];
    if (!e || e.status === 'broken') return;
    e.status = 'broken';
    e.brokenAtMin = this.clockMin;
    e.breakLeakGPM = Math.min(420, Math.max(120, (e.currentFlow || 200) * 0.3));
    e.leakGPM = e.breakLeakGPM;
    this.raise('break:' + e.id, 'critical', e.id, `Water main break on ${e.name}. Estimated loss ${Math.round(e.leakGPM)} GPM. Pressure dropping downstream.`);
    this.addTicket(e.id, 'Emergency repair: ' + e.name, 'Emergency');
  }

  private updateBackgroundLeaks() {
    for (const e of this.edges.values()) {
      if ((e as any).closed) { e.leakGPM = 0; continue; } if (e.status === 'broken') { e.leakGPM = e.breakLeakGPM* (0.92 + Math.random() * 0.16); continue; }
      const base = Math.max(0, e.currentFlow - e.leakGPM);
      e.leakGPM = base * ((100 - e.condition) / 100) * 0.02;
    }
  }

  private feederOnline(id: string): boolean {
    let cur = this.parentEdge.get(id)?.from;
    while (cur) {
      const n = this.nodes.get(cur);
      if (!n) break;
      if (n.type === 'PumpStation' && !n.online) return false;
      if (n.type === 'Reservoir' || n.type === 'TreatmentPlant') break;
      cur = this.parentEdge.get(cur)?.from;
    }
    return true;
  }

  /** Bottom-up: each pipe carries downstream demand plus its own leakage. Reservoirs buffer via the pumping schedule. */
  private solveFlows(hour: number) {
    const walk = (id: string): number => {
      const n = this.node(id);
      let out = n.type === 'DemandPoint' ? n.demandGPM : 0;
      for (const e of this.kids(id)) {
        e.currentFlow = walk(e.to) + e.leakGPM;
        out += e.currentFlow;
      }
      n.outflowGPM = out;
      n.inflowGPM = n.type === 'Reservoir' ? (this.feederOnline(id) ? out * fillFactor(hour, n.levelPct) * ((this as any).supplyFactor ?? 1) : 0) : out;
      return n.inflowGPM;
    };
    walk(this.rootId);
    for (const n of this.nodes.values()) {
      if (n.type === 'TreatmentPlant' || n.type === 'PumpStation') n.loadPct = n.ratedGPM > 0 ? (n.outflowGPM / n.ratedGPM) * 100 : 0;
    }
    for (const e of this.edges.values()) e.utilisation = e.capacityGPM > 0 ? e.currentFlow / e.capacityGPM : 0;
  }

  private updateReservoirs() {
    for (const n of this.nodes.values()) {
      if (n.type !== 'Reservoir') continue;
      n.volumeGal = Math.min(n.capacityGal, Math.max(0, n.volumeGal + (n.inflowGPM - n.outflowGPM) * this.minutesPerTick));
      n.levelPct = n.capacityGal > 0 ? (n.volumeGal / n.capacityGal) * 100 : 0;
    }
  }

  private headLossM(e: EdgeState): number {
    const q = Math.max(1, e.currentFlow);
    const dIn = e.diameterMm / 25.4;
    const c = HW_C[e.material] * (0.65 + (0.35 * e.condition) / 100); // worse condition = rougher pipe
    const psiPerFt = (4.52 * Math.pow(q, 1.85)) / (Math.pow(c, 1.85) * Math.pow(dIn, 4.87)); // Hazen-Williams, GPM / inches
    return (psiPerFt * e.lengthM * 3.28084) / PSI_PER_M;
  }

  /** Top-down: hydraulic head from the plant, pump boosts, reservoir surface level as gravity datum, friction and break losses. */
  private solvePressure() {
    const walk = (id: string, headIn: number) => {
      const n = this.node(id);
      const levelM = (n.levelPct / 100) * n.tankDepthM;
      let head = headIn;
      if (n.type === 'TreatmentPlant') head = n.elevationM + 40;
      else if (n.type === 'PumpStation') head = headIn + (n.online ? n.pumpHeadM : 0);
      else if (n.type === 'Reservoir') head = n.elevationM + levelM;
      n.headM = head;
      n.pressurePsi = n.type === 'Reservoir' ? levelM * PSI_PER_M : Math.max(0, (head - n.elevationM) * PSI_PER_M);
      for (const e of this.kids(id)) {
        const child = this.node(e.to);
        const endHead = head - this.headLossM(e) - (e.status === 'broken' ? BREAK_DROP_M : 0);
        e.currentPressure = Math.max(0, (endHead - child.elevationM) * PSI_PER_M); // pressure at the downstream end
        walk(e.to, endHead);
      }
    };
    walk(this.rootId, 0);
  }

  // ---- tickets ----
  private addTicket(assetId: string, task: string, priority: 'Emergency' | 'Routine') {
    if (this.tickets.some((t) => t.assetId === assetId && t.priority === priority && t.status !== 'Done')) return;
    this.tickets.unshift({ id: 'WO-' + (4100 + ++this.ticketSeq), assetId, task, priority, status: 'Open', progress: 0, age: 0, doneAge: 0 });
  }

  private updateTickets() {
    for (const t of this.tickets) {
      if (t.status === 'Done') { t.doneAge++; continue; }
      t.age++;
      const em = t.priority === 'Emergency';
      const dispatchAt = em ? 6 : 24;
      const repairAt = em ? 12 : 40;
      const rate = em ? 9 : 3.5;
      if (t.status === 'Open' && t.age >= dispatchAt) t.status = 'Crew dispatched';
      if (t.status === 'Crew dispatched' && t.age >= repairAt) t.status = 'Repairing';
      if (t.status === 'Repairing') {
        t.progress = Math.min(100, t.progress + rate);
        if (t.progress >= 100) { t.status = 'Done'; this.completeRepair(t.assetId); }
      }
    }
    this.tickets = this.tickets.filter((t) => t.status !== 'Done' || t.doneAge < 12);
  }

  private completeRepair(assetId: string) {
    const e = this.edges.get(assetId);
    if (!e) return;
    e.condition = Math.max(e.condition, e.status === 'broken' ? 92 : 85);
    e.status = 'normal';
    e.status = this.statusOf(e);
    e.breakLeakGPM = 0;
    e.leakGPM = 0;
    this.resolve('break:' + assetId);
    this.raise('fixed:' + assetId, 'info', assetId, `Repair completed on ${e.name}. Flow and pressure restored.`, 12);
    for (const t of this.tickets) {
      if (t.assetId === assetId && t.status !== 'Done') { t.status = 'Done'; t.progress = 100; }
    }
  }

  // ---- alerts ----
  private clockLabel() { return `D${Math.floor(this.clockMin / 1440) + 1} ${fmtClock(this.clockMin)}`; }

  private raise(key: string, severity: Severity, assetId: string, message: string, ttl = 0) {
    const ex = this.alerts.get(key);
    if (ex && ex.active) { ex.severity = severity; ex.message = message; return; }
    this.alerts.set(key, {
      id: 'A' + ++this.alertSeq, seq: this.alertSeq, key, severity, assetId, message, time: this.clockLabel(),
      resolvedAt: '', acknowledged: false, active: true, expiresTick: ttl > 0 ? this.tickCount + ttl : -1,
    });
  }
  private resolve(key: string) {
    const a = this.alerts.get(key);
    if (a && a.active) { a.active = false; a.resolvedAt = this.clockLabel(); }
  }

  private updateAlerts() {
    for (const e of this.edges.values()) {
      if (e.status === 'broken') this.raise('break:' + e.id, 'critical', e.id, `Water main break on ${e.name}. Estimated loss ${Math.round(e.leakGPM)} GPM. Pressure dropping downstream.`);
      if (e.utilisation > 0.9) this.raise('ovl:' + e.id, 'warning', e.id, `${e.name} at ${Math.round(e.utilisation * 100)}% of capacity.`);
      else if (e.utilisation < 0.85) this.resolve('ovl:' + e.id);
    }
    for (const n of this.nodes.values()) {
      n.health = 'ok';
      if (n.type === 'DemandPoint') {
        const p = n.pressurePsi;
        if (p < 25) { this.raise('lowp:' + n.id, 'critical', n.id, `Very low pressure at ${n.name}: ${p.toFixed(0)} PSI.`); n.health = 'alert'; }
        else if (p < 40) { this.raise('lowp:' + n.id, 'warning', n.id, `Low pressure at ${n.name}: ${p.toFixed(0)} PSI.`); n.health = 'warn'; }
        else if (p >= 45) this.resolve('lowp:' + n.id);
      } else if (n.type === 'Reservoir') {
        const l = n.levelPct;
        if (l < 15) { this.raise('low:' + n.id, 'critical', n.id, `${n.name} critically low: ${l.toFixed(0)}%.`); n.health = 'alert'; }
        else if (l < 30) { this.raise('low:' + n.id, 'warning', n.id, `${n.name} low: ${l.toFixed(0)}%.`); n.health = 'warn'; }
        else if (l >= 35) this.resolve('low:' + n.id);
      } else if (n.type === 'PumpStation') {
        if (!n.online) { this.raise('pump:' + n.id, 'critical', n.id, `${n.name} is offline. Downstream reservoir is no longer being filled.`); n.health = 'down'; }
        else this.resolve('pump:' + n.id);
      }
    }
    for (const a of this.alerts.values()) {
      if (a.active && a.expiresTick >= 0 && this.tickCount >= a.expiresTick) { a.active = false; a.resolvedAt = this.clockLabel(); }
    }
  }

  private updateUptime() {
    const hIdx = Math.floor(this.clockMin / 60);
    for (const n of this.nodes.values()) if (n.type === 'PumpStation' && !n.online) this.downThisHour.add(n.id);
    if (hIdx !== this.hourIdx) {
      for (const n of this.nodes.values()) {
        if (n.type !== 'PumpStation' && n.type !== 'TreatmentPlant') continue;
        n.uptime.push(!this.downThisHour.has(n.id));
        if (n.uptime.length > 24) n.uptime.shift();
      }
      this.downThisHour.clear();
      this.hourIdx = hIdx;
    }
    for (const n of this.nodes.values()) {
      if (n.type === 'PumpStation' || n.type === 'TreatmentPlant') n.uptimePct = Math.round((100 * n.uptime.filter(Boolean).length) / n.uptime.length);
    }
  }

  private record() {
    const demandNodes = [...this.nodes.values()].filter((n) => n.type === 'DemandPoint');
    const demand = demandNodes.reduce((s, n) => s + n.demandGPM, 0);
    const pressure = demandNodes.length ? demandNodes.reduce((s, n) => s + n.pressurePsi, 0) / demandNodes.length : 0;
    this.history.push({ clockMin: this.clockMin, demand, supply: this.node(this.rootId).outflowGPM, pressure });
    if (this.history.length > HISTORY_MAX) this.history.shift();
  }

  private publish() {
    const nodes = [...this.nodes.values()].map((n) => ({ ...n, uptime: [...n.uptime] }));
    const edges = [...this.edges.values()].map((e) => ({
      ...e, coords: e.coords, conditionClass: e.status === 'broken' ? ('Critical' as ConditionClass) : classify(e.condition),
    }));
    const demandNodes = nodes.filter((n) => n.type === 'DemandPoint');
    const demand = demandNodes.reduce((s, n) => s + n.demandGPM, 0);
    const pressure = demandNodes.length ? demandNodes.reduce((s, n) => s + n.pressurePsi, 0) / demandNodes.length : 0;
    const supply = this.node(this.rootId).outflowGPM;
    const leakage = edges.reduce((s, e) => s + e.leakGPM, 0);
    const counts: Record<ConditionClass, number> = { Good: 0, Fair: 0, Poor: 0, Critical: 0 };
    const km: Record<ConditionClass, number> = { Good: 0, Fair: 0, Poor: 0, Critical: 0 };
    let wsum = 0;
    let lsum = 0;
    for (const e of edges) {
      counts[e.conditionClass]++;
      km[e.conditionClass] += e.lengthM / 1000;
      wsum += e.condition * e.lengthM;
      lsum += e.lengthM;
    }
    const alerts = [...this.alerts.values()].sort((a, b) => b.seq - a.seq);
    const active = alerts.filter((a) => a.active);
    const resolved = alerts.filter((a) => !a.active).slice(0, 6);
    const leaks: LeakEntry[] = edges
      .filter((e) => e.leakGPM >= 1)
      .map((e) => ({
        assetId: e.id, name: e.name, gpm: e.leakGPM,
        type: e.status === 'broken' ? 'Water main break' : 'Background leakage',
        since: e.status === 'broken' ? `D${Math.floor(e.brokenAtMin / 1440) + 1} ${fmtClock(e.brokenAtMin)}` : 'ongoing',
      }))
      .sort((a, b) => b.gpm - a.gpm);
    this.snap = {
      version: ++this.version, running: this.running, minutesPerTick: this.minutesPerTick, clockMin: this.clockMin,
      clockLabel: fmtClock(this.clockMin), dayLabel: `Day ${Math.floor(this.clockMin / 1440) + 1}`,
      nodes, edges, alerts: [...active, ...resolved], tickets: this.tickets.map((t) => ({ ...t })), leaks,
      history: [...this.history],
      kpi: { pressurePsi: pressure, demandGPM: demand, supplyGPM: supply, leakageGPM: leakage, nrwPct: supply > 0 ? (leakage / supply) * 100 : 0, health: lsum ? wsum / lsum : 0, counts, km },
    };
    this.listeners.forEach((l) => l());
  }
}