// @ts-nocheck
import { useSyncExternalStore } from 'react';
import { sendCommunication } from '@/lib/nia-comms.functions';
import { ALERT_EMAIL, ALERT_PHONE } from '@/lib/nia-comms';

const PSI_PER_M = 1.4223;
const SURGE_PSI = 40;
const MAX_REAL_SENDS = 3;

let incidents: any[] = [];
let state: any = {
  incidents: [], popupId: null, events: [],
  settings: { demoTiming: true, testMode: true, armed: false, voice: true, sentReal: 0 },
};
let token = '';
let sim: any = null;
let prev: any = null;
let seq = 0;
let lastPower = 0;
let unsub: any = null;
let timer: any = null;
const spokenIds = new Set<string>();
const subs = new Set<() => void>();

function emit() {
  state = { ...state, incidents: [...incidents], events: [...state.events], settings: { ...state.settings } };
  subs.forEach((l) => l());
}
export function useAgent() {
  return useSyncExternalStore((l) => { subs.add(l); return () => { subs.delete(l); }; }, () => state, () => state);
}

const hhmmss = (d: Date = new Date()) => d.toTimeString().slice(0, 8);
const gpm = (v: number) => Math.round(v) + ' GPM';
const m3h = (v: number) => (v * 0.2271).toFixed(0) + ' m3/h';
const fmtS = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return s >= 60 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : s + 's'; };
const nameOf = (s: any, id: string) => { const n = s.nodes.find((x: any) => x.id === id); return n ? n.name : id; };
function note(inc: any, text: string) { inc.log.push(hhmmss() + ' ' + text); }
function agentEvent(text: string) { state.events = [{ time: hhmmss(), text }, ...state.events].slice(0, 12); }

export function timings() {
  return state.settings.demoTiming ? { email: 20000, call: 40000 } : { email: 300000, call: 600000 };
}

// ---------- settings ----------
export function setSetting(key: string, value: any) {
  state.settings[key] = value;
  if (key === 'testMode' && value === true) { state.settings.armed = false; token = ''; }
  emit();
}
export function armReal(pass: string) {
  if (state.settings.testMode || !pass || !pass.trim()) return false;
  token = pass.trim();
  state.settings.armed = true;
  emit();
  return true;
}
export function disarm() { token = ''; state.settings.armed = false; emit(); }

// ---------- voice ----------
function say(text: string) {
  try {
    const ss = window.speechSynthesis;
    if (!ss) return;
    const clean = text.replace(/GPM/g, 'gallons per minute').replace(/PSI/g, 'P S I').replace(/m3\/h/g, 'cubic metres per hour');
    const u = new SpeechSynthesisUtterance(clean);
    const vs = ss.getVoices();
    let v: any = null;
    for (const p of ['Ryan', 'George', 'Google UK English Male', 'Daniel', 'Arthur']) { v = vs.find((x: any) => x.name.includes(p)); if (v) break; }
    if (!v) v = vs.find((x: any) => x.lang === 'en-GB') || null;
    if (v) u.voice = v;
    u.rate = 0.96; u.pitch = 0.8;
    ss.cancel(); ss.speak(u);
  } catch { /* speech is optional */ }
}

// ---------- network helpers ----------
function downstream(s: any, nodeId: string): string[] {
  const out: string[] = [];
  const stack = [nodeId];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of s.edges) if (e.from === cur) { out.push(e.to); stack.push(e.to); }
  }
  return out;
}
function upstreamCause(s: any, nodeId: string) {
  let cur = nodeId;
  for (let i = 0; i < 12; i++) {
    const pe = s.edges.find((e: any) => e.to === cur);
    if (!pe) return null;
    if (pe.status === 'broken') return { type: 'break', id: pe.id, name: pe.name };
    const from = s.nodes.find((n: any) => n.id === pe.from);
    if (from && from.type === 'PumpStation' && !from.online) return { type: 'pump', id: from.id, name: from.name };
    cur = pe.from;
  }
  return null;
}
function mid(e: any) {
  const c = e.coords[Math.floor(e.coords.length / 2)] || e.coords[0];
  return c[1].toFixed(4) + ', ' + c[0].toFixed(4);
}

// ---------- describe an engine alert: what, where, impact, urgency, advice ----------
function describe(a: any, s: any) {
  const parts = a.key.split(':');
  const kind = parts[0];
  const id = parts[1];
  const out: any = {
    title: a.message, where: id, impact: '', cause: '', advice: [],
    urgency: a.severity === 'critical' ? 'CRITICAL: act now' : 'WARNING: watch closely',
  };
  if (kind === 'break') {
    const e = s.edges.find((x: any) => x.id === id);
    if (!e) return out;
    const cut = [e.to, ...downstream(s, e.to)].map((i) => s.nodes.find((n: any) => n.id === i)).filter((n: any) => n && n.type === 'DemandPoint');
    const names = cut.map((n: any) => n.name).join(', ') || 'none';
    const dem = cut.reduce((t: number, n: any) => t + n.demandGPM, 0);
    const minP = cut.length ? Math.min(...cut.map((n: any) => n.pressurePsi)) : 0;
    const tk = s.tickets.find((t: any) => t.assetId === id && t.priority === 'Emergency' && t.status !== 'Done');
    out.title = 'Water main break on ' + e.name;
    out.where = e.name + ' (' + e.id + '), ' + e.diameterMm + ' mm ' + e.material + ', between ' + nameOf(s, e.from) + ' and ' + nameOf(s, e.to) + '. Approx. position ' + mid(e) + ' (lat, lon).';
    out.impact = 'Losing about ' + gpm(e.leakGPM) + ' (' + m3h(e.leakGPM) + '). ' + cut.length + ' zone(s) downstream: ' + names + '. Lowest pressure there: ' + minP.toFixed(0) + ' PSI.';
    out.urgency = 'CRITICAL: ' + (e.leakGPM > 200 ? 'large loss, act now' : 'act now');
    out.advice = [
      'Isolate the break: close the valves at both ends of ' + e.id + ' (simulated valves). This stops the ' + gpm(e.leakGPM) + ' loss but cuts supply to ' + names + ' (' + gpm(dem) + ' of demand).',
      tk ? 'Repair crew: ' + tk.id + ' is ' + tk.status.toLowerCase() + '.' : 'Dispatch an emergency repair crew.',
      'No alternative supply exists in this tree-shaped prototype network, so isolation and repair is the only option. A looped interconnect would let the system re-route.',
    ];
  } else if (kind === 'lowp') {
    const n = s.nodes.find((x: any) => x.id === id);
    if (!n) return out;
    const c = upstreamCause(s, id);
    out.title = (a.severity === 'critical' ? 'Very low' : 'Low') + ' pressure at ' + n.name;
    out.where = n.name + ' (' + n.id + '), elevation ' + n.elevationM + ' m.';
    out.impact = 'Pressure is ' + n.pressurePsi.toFixed(0) + ' PSI (target 65). Demand of ' + gpm(n.demandGPM) + ' is affected.';
    out.urgency = a.severity === 'critical' ? 'HIGH: service is failing' : 'MEDIUM: pressure below normal';
    if (c) {
      out.cause = 'Likely root cause: ' + (c.type === 'break' ? 'water main break on ' + c.name : c.name + ' is offline') + '. This alert is a symptom of that.';
      out.advice = ['Deal with the root cause first (' + c.id + ').'];
    } else out.advice = ['Check reservoir levels and pump status upstream of ' + n.id + '.'];
  } else if (kind === 'low') {
    const r = s.nodes.find((x: any) => x.id === id);
    if (!r) return out;
    const c = upstreamCause(s, id);
    const net = r.outflowGPM - r.inflowGPM;
    const hrs = net > 1 ? r.volumeGal / net / 60 : 0;
    out.title = r.name + ' is ' + (a.severity === 'critical' ? 'critically ' : '') + 'low';
    out.where = r.name + ' (' + r.id + '), elevation ' + r.elevationM + ' m.';
    out.impact = 'Level ' + r.levelPct.toFixed(0) + '% (' + (r.volumeGal / 1000).toFixed(0) + 'k gal). ' + (hrs ? 'At the current rate it empties in about ' + (hrs >= 1 ? hrs.toFixed(1) + ' h' : Math.round(hrs * 60) + ' min') + ' of simulated time.' : 'Level is stable or recovering.');
    out.urgency = a.severity === 'critical' ? 'HIGH: storage nearly empty' : 'MEDIUM: storage falling';
    if (c) out.cause = 'Likely root cause: ' + (c.type === 'pump' ? c.name + ' is offline' : 'break on ' + c.name) + '.';
    out.advice = ['Restore the feeding pump or reduce demand.'];
  } else if (kind === 'pump') {
    const n = s.nodes.find((x: any) => x.id === id);
    if (!n) return out;
    const res = downstream(s, id).map((i) => s.nodes.find((x: any) => x.id === i)).filter((x: any) => x && x.type === 'Reservoir').map((x: any) => x.name).join(', ') || 'none';
    out.title = n.name + ' is offline';
    out.where = n.name + ' (' + n.id + '), elevation ' + n.elevationM + ' m.';
    out.impact = 'Not filling: ' + res + '. Expected pressure surge on restart: up to about ' + (n.pumpHeadM * PSI_PER_M).toFixed(0) + ' PSI on the connecting main.';
    out.urgency = 'HIGH: storage will drain';
    if (lastPower && Date.now() - lastPower < 180000) out.cause = 'Correlated with the simulated power event at ' + hhmmss(new Date(lastPower)) + ' (Energy sector).';
    out.advice = ['Restart with a staged (soft) start to limit the surge (simulated procedure).', 'Watch reservoir levels while the pump is out.'];
  } else if (kind === 'ovl') {
    const e = s.edges.find((x: any) => x.id === id);
    if (!e) return out;
    out.title = e.name + ' near capacity';
    out.where = e.name + ' (' + e.id + '), between ' + nameOf(s, e.from) + ' and ' + nameOf(s, e.to) + '.';
    out.impact = 'Flow ' + gpm(e.currentFlow) + ' of ' + e.capacityGPM + ' GPM capacity (' + (e.utilisation * 100).toFixed(0) + '%).';
    out.urgency = 'MEDIUM: capacity nearly used';
    out.advice = ['Check for unusual demand or a closed valve downstream.'];
  }
  return out;
}

// ---------- incident lifecycle ----------
function nextPopup() {
  const n = incidents.find((i) => i.severity === 'critical' && i.status === 'open');
  return n ? n.id : null;
}
function announce(inc: any) {
  if (inc.severity !== 'critical') return;
  state.popupId = inc.id;
  if (state.settings.voice && !spokenIds.has(inc.id)) {
    spokenIds.add(inc.id);
    say('Sir, critical alert. ' + inc.title + '. ' + inc.impact.split('. ').slice(0, 2).join('. ') + ' Please acknowledge.');
  }
}
function resolveInc(inc: any, why: string) {
  inc.status = 'resolved';
  note(inc, why);
  if (state.popupId === inc.id) state.popupId = nextPopup();
}
function upsert(a: any, s: any) {
  const d = describe(a, s);
  let inc = incidents.find((i) => i.key === a.key && i.status !== 'resolved');
  if (!inc) {
    inc = {
      id: 'INC-' + (++seq), key: a.key, source: 'engine', severity: a.severity, assetId: a.assetId, ...d,
      createdAt: Date.now(), clock: s.dayLabel + ' ' + s.clockLabel, status: a.acknowledged ? 'acknowledged' : 'open',
      emailSent: false, callSent: false, emailMode: '', callMode: '', log: [], engineAlertId: a.id, autoResolveAt: 0,
    };
    incidents.unshift(inc);
    incidents = incidents.slice(0, 30);
    note(inc, 'Detected by NIA Watch (' + inc.clock + ' simulated clock).');
    announce(inc);
  } else {
    Object.assign(inc, d);
    inc.severity = a.severity;
    inc.engineAlertId = a.id;
    if (a.acknowledged && inc.status === 'open') inc.status = 'acknowledged';
  }
}
function addAgentIncident(o: any) {
  const inc = {
    id: 'INC-' + (++seq), source: 'agent', createdAt: Date.now(), status: 'open', emailSent: false, callSent: false,
    emailMode: '', callMode: '', log: [], autoResolveAt: 0, clock: sim ? sim.getSnapshot().dayLabel + ' ' + sim.getSnapshot().clockLabel : '', ...o,
  };
  note(inc, 'Raised by NIA Watch.');
  incidents.unshift(inc);
  incidents = incidents.slice(0, 30);
  announce(inc);
}

// ---------- surge catching: a large one-step pressure rise ----------
function detectSurges(p: any, s: any) {
  for (const e of s.edges) {
    const pe = p.edges.find((x: any) => x.id === e.id);
    if (!pe) continue;
    const rise = e.currentPressure - pe.currentPressure;
    if (rise < SURGE_PSI) continue;
    if (incidents.some((i) => i.key.indexOf('surge:' + e.id) === 0 && Date.now() - i.createdAt < 30000)) continue;
    const from = s.nodes.find((n: any) => n.id === e.from);
    const fromPrev = p.nodes.find((n: any) => n.id === e.from);
    const restarted = !!(from && fromPrev && from.type === 'PumpStation' && !fromPrev.online && from.online);
    const corr = restarted && lastPower && Date.now() - lastPower < 900000;
    const critical = rise >= 60 && e.condition < 60;
    addAgentIncident({
      key: 'surge:' + e.id + ':' + Date.now(),
      severity: critical ? 'critical' : 'warning', assetId: e.id,
      title: 'Pressure surge on ' + e.name,
      where: e.name + ' (' + e.id + '), ' + e.diameterMm + ' mm ' + e.material + ', between ' + nameOf(s, e.from) + ' and ' + nameOf(s, e.to) + '. Approx. position ' + mid(e) + ' (lat, lon).',
      impact: 'Pressure jumped ' + rise.toFixed(0) + ' PSI in one step (to ' + e.currentPressure.toFixed(0) + ' PSI). Pipe condition ' + e.condition.toFixed(0) + '%.',
      urgency: critical ? 'CRITICAL: weak pipe exposed to a large surge' : 'MEDIUM: investigate the transient',
      cause: restarted
        ? (corr ? 'Correlated with the simulated power event at ' + hhmmss(new Date(lastPower)) + ': ' + from.name + ' restarted after the dip.' : from.name + ' restarted.')
        : 'Cause not identified.',
      advice: [
        'Use a staged (soft) restart: partly open the discharge valve, start the pump, then open slowly (simulated procedure).',
        'Inspect ' + e.name + ' for damage. Surges raise the burst risk on weak pipes.',
        'This prototype does not model water hammer. The alert comes from the size of the pressure step.',
      ],
      autoResolveAt: critical ? 0 : Date.now() + 120000,
    });
  }
}

function onSnap() {
  if (!sim) return;
  const s = sim.getSnapshot();
  if (prev && s.clockMin < prev.clockMin) {
    incidents = []; state.popupId = null; spokenIds.clear(); prev = null;
    agentEvent('Simulation reset. Incident history cleared.');
  }
  const seen = new Set<string>();
  for (const a of s.alerts) {
    if (a.severity === 'info') continue;
    seen.add(a.key);
    if (a.active) upsert(a, s);
    else {
      const inc = incidents.find((i) => i.key === a.key && i.status !== 'resolved');
      if (inc) resolveInc(inc, 'Resolved by the system at ' + a.resolvedAt + ' (simulated clock).');
    }
  }
  for (const inc of incidents) {
    if (inc.source === 'engine' && inc.status !== 'resolved' && !seen.has(inc.key)) resolveInc(inc, 'Cleared.');
  }
  if (prev && s.version !== prev.version) detectSurges(prev, s);
  prev = s;
  emit();
}

// ---------- escalation: email, then call, if nobody acknowledges ----------
function emailBody(inc: any) {
  return [
    'This is a SIMULATED alert from the NamTwin Water prototype. No real network is affected.', '',
    inc.title, 'Severity: CRITICAL (' + inc.urgency + ')', 'Where: ' + inc.where, 'Impact: ' + inc.impact,
    inc.cause ? 'Cause: ' + inc.cause : '', 'Recommended: ' + (inc.advice[0] || ''),
    'Raised: ' + inc.clock + ' (simulated clock)',
    'Status: not acknowledged after ' + Math.round((Date.now() - inc.createdAt) / 1000) + ' seconds.',
    'Please open the dashboard and acknowledge the alert.',
  ].filter((l) => l !== null).join('\n');
}
function callText(inc: any) {
  const first = inc.impact.split('. ')[0];
  return ('This is a simulated alert from Nam Twin Water. Critical: ' + inc.title + '. ' + first + '. Nobody has acknowledged it. Please open the dashboard and acknowledge the alert.')
    .replace(/GPM/g, 'gallons per minute').replace(/PSI/g, 'P S I').replace(/m3\/h/g, 'cubic metres per hour');
}
async function escalate(kind: 'email' | 'call', inc: any) {
  const real = state.settings.armed && !state.settings.testMode && !!token;
  const mode = real ? 'REAL' : 'simulated';
  const label = kind === 'email' ? 'Email' : 'Call';
  if (real && state.settings.sentReal >= MAX_REAL_SENDS) {
    note(inc, label + ' NOT sent: session limit of ' + MAX_REAL_SENDS + ' real messages reached.');
    if (kind === 'email') inc.emailMode = 'blocked'; else inc.callMode = 'blocked';
    emit();
    return;
  }
  if (kind === 'email') inc.emailMode = mode; else inc.callMode = mode;
  note(inc, label + ' escalation started (' + mode + '): no acknowledgement.');
  emit();
  const draft = kind === 'email'
    ? { kind: 'email', recipient: ALERT_EMAIL, subject: ('[SIMULATED] NamTwin Water CRITICAL: ' + inc.title).slice(0, 190), message: emailBody(inc) }
    : { kind: 'call', recipient: ALERT_PHONE, subject: '', message: callText(inc) };
  try {
    const r: any = await sendCommunication({ data: { draft, testMode: !real, confirmed: true, token: real ? token : '', requestId: crypto.randomUUID() } });
    if (real) state.settings.sentReal += 1;
    note(inc, label + ' result: ' + ((r && r.message) || 'done'));
  } catch (e: any) {
    note(inc, label + ' failed: ' + String((e && e.message) || e).slice(0, 200));
  }
  emit();
}

function tick() {
  if (!sim) return;
  const now = Date.now();
  const t = timings();
  let changed = false;
  for (const inc of incidents) {
    if (inc.status === 'resolved') continue;
    if (inc.autoResolveAt && now >= inc.autoResolveAt) { resolveInc(inc, 'Closed automatically: no further surge.'); changed = true; continue; }
    if (inc.key === 'predict:PS-1') {
      const p = sim.getNode('PS-1');
      if (p && p.online) { resolveInc(inc, 'PS-1 is back online.'); changed = true; continue; }
    }
    if (inc.severity === 'critical' && inc.status === 'open') {
      const age = now - inc.createdAt;
      if (!inc.emailSent && age >= t.email) { inc.emailSent = true; escalate('email', inc); changed = true; }
      if (!inc.callSent && age >= t.call) { inc.callSent = true; escalate('call', inc); changed = true; }
    }
  }
  if (changed) emit();
}

export function escalationInfo(inc: any, now: number) {
  if (inc.severity !== 'critical') return '';
  if (inc.status === 'acknowledged') return 'Acknowledged. Escalation stopped.';
  if (inc.status === 'resolved') return 'Resolved.';
  const t = timings();
  const age = now - inc.createdAt;
  const em = inc.emailSent ? 'email sent (' + inc.emailMode + ')' : 'email in ' + fmtS(t.email - age);
  const ca = inc.callSent ? 'call placed (' + inc.callMode + ')' : 'call in ' + fmtS(t.call - age);
  return 'Not acknowledged: ' + em + ' \u00b7 ' + ca;
}

// ---------- operator actions ----------
export function acknowledge(id: string) {
  const inc = incidents.find((i) => i.id === id);
  if (!inc || inc.status !== 'open') return;
  inc.status = 'acknowledged';
  note(inc, 'Acknowledged by operator. Escalation stopped.');
  if (inc.engineAlertId && sim) sim.acknowledge(inc.engineAlertId);
  if (state.popupId === id) state.popupId = nextPopup();
  emit();
}
export function ackAll() {
  for (const inc of [...incidents]) if (inc.status === 'open') acknowledge(inc.id);
}
export function closePopup() { state.popupId = null; emit(); }

// ---------- cross-asset event: power dip at a substation (simulated) ----------
export function simulatePowerDip() {
  if (!sim) return;
  const ps = sim.getNode('PS-1');
  if (!ps) return;
  if (!ps.online) { agentEvent('PS-1 is already offline.'); emit(); return; }
  lastPower = Date.now();
  agentEvent('Energy sector (simulated): voltage dip at a Windhoek substation. PS-1 lost power.');
  sim.togglePump('PS-1');
  addAgentIncident({
    key: 'predict:PS-1', severity: 'warning', assetId: 'PS-1',
    title: 'Heads-up: restarting PS-1 will cause a pressure surge',
    where: 'Transfer main E-02, between PS-1 and R-1.',
    impact: 'NIA Watch expects a pressure step of up to about ' + (ps.pumpHeadM * PSI_PER_M).toFixed(0) + ' PSI on E-02 when PS-1 restarts. This is an estimate from the pump head.',
    urgency: 'MEDIUM: plan the restart',
    cause: 'Correlated with the simulated power event (Energy sector).',
    advice: ['Restart only when power is stable.', 'Use a staged (soft) restart (simulated procedure).'],
  });
  emit();
}
export function restorePower() {
  if (!sim) return;
  const ps = sim.getNode('PS-1');
  if (ps && !ps.online) { agentEvent('Power restored. PS-1 restarting (simulated).'); sim.togglePump('PS-1'); }
  emit();
}

// ---------- NIA water commands ----------
function resolveId(place: any, def: string) {
  const up = String(place || '').toUpperCase().replace(/\s+/g, '').replace(/PUMPSTATION|PUMP/g, 'PS').replace(/RESERVOIR/g, 'R').replace(/ZONE/g, 'D').replace(/TREATMENTPLANT|PLANT/g, 'TP').replace(/PIPE/g, 'E');
  const m = up.match(/(TP|PS|R|D|E)-?(\d{1,2})/);
  if (m) return m[1] + '-' + (m[1] === 'E' ? m[2].padStart(2, '0') : String(Number(m[2])));
  const d = up.match(/(\d{1,2})/);
  if (d && def) return def + '-' + (def === 'E' ? d[1].padStart(2, '0') : String(Number(d[1])));
  return '';
}
export function runWaterCommand(s: any, action: string, place?: string): string {
  if (!s) return '';
  switch (action) {
    case 'water_break': { const id = resolveId(place, 'E'); s.triggerBreak(id || undefined); return id; }
    case 'water_trip_pump': { const id = resolveId(place, 'PS'); const n = id ? s.getNode(id) : null; if (n && n.type === 'PumpStation' && n.online) s.togglePump(id); return id; }
    case 'water_restore_pump': { const id = resolveId(place, 'PS'); const n = id ? s.getNode(id) : null; if (n && n.type === 'PumpStation' && !n.online) s.togglePump(id); return id; }
    case 'water_ack': ackAll(); return '';
    case 'water_power_dip': simulatePowerDip(); return 'PS-1';
    case 'water_restore_power': restorePower(); return 'PS-1';
    case 'water_focus': { const id = resolveId(place, ''); return id && (s.getNode(id) || s.getEdge(id)) ? id : ''; }
  }
  return '';
}

// ---------- live context for NIA ----------
export function waterSummary(s: any, incs: any[]) {
  const k = s.kpi;
  const L: string[] = [];
  L.push('WATER TWIN (SIMULATED illustrative network, not City of Windhoek data). Units: GPM and PSI. Clock: ' + s.dayLabel + ' ' + s.clockLabel + (s.running ? '' : ' (paused)') + '.');
  L.push('System: average pressure ' + k.pressurePsi.toFixed(0) + ' PSI (target 65), demand ' + k.demandGPM.toFixed(0) + ' GPM (target 800), supply ' + k.supplyGPM.toFixed(0) + ' GPM, leakage ' + k.leakageGPM.toFixed(0) + ' GPM (' + k.nrwPct.toFixed(1) + '% of supply), network health ' + k.health.toFixed(0) + '%.');
  L.push('Pipe condition: Good ' + k.counts.Good + ', Fair ' + k.counts.Fair + ', Poor ' + k.counts.Poor + ', Critical ' + k.counts.Critical + '.');
  for (const n of s.nodes) {
    if (n.type === 'Reservoir') L.push(n.id + ' ' + n.name + ': ' + n.levelPct.toFixed(0) + '% full, in ' + n.inflowGPM.toFixed(0) + ' / out ' + n.outflowGPM.toFixed(0) + ' GPM.');
    else if (n.type === 'PumpStation' || n.type === 'TreatmentPlant') L.push(n.id + ' ' + n.name + ': ' + (n.online ? 'online' : 'OFFLINE') + ', load ' + n.loadPct.toFixed(0) + '%.');
    else L.push(n.id + ' ' + n.name + ': ' + n.pressurePsi.toFixed(0) + ' PSI, demand ' + n.demandGPM.toFixed(0) + ' GPM.');
  }
  for (const e of s.edges) {
    L.push(e.id + ' ' + e.name + ': flow ' + e.currentFlow.toFixed(0) + '/' + e.capacityGPM + ' GPM, pressure ' + e.currentPressure.toFixed(0) + ' PSI, condition ' + e.condition.toFixed(0) + '% (' + e.conditionClass + '), ' + e.status + (e.leakGPM >= 1 ? ', leaking ' + e.leakGPM.toFixed(0) + ' GPM' : '') + '.');
  }
  const open = incs.filter((i) => i.status !== 'resolved');
  L.push(open.length
    ? 'ACTIVE INCIDENTS: ' + open.map((i) => '[' + i.severity.toUpperCase() + '/' + i.status + '] ' + i.title + ' (' + i.assetId + '): ' + i.impact + (i.cause ? ' ' + i.cause : '')).join(' | ')
    : 'No active incidents.');
  L.push('You can control this twin with map_command water_* actions: water_break, water_trip_pump, water_restore_pump, water_ack, water_power_dip, water_restore_power, water_focus. Asset ids: TP-1, PS-1, PS-2, R-1, R-2, D-1 to D-6, pipes E-01 to E-10.');
  return L.join('\n').slice(0, 5800);
}

// ---------- start and stop ----------
export function stopAgent() {
  if (unsub) unsub();
  unsub = null;
  if (timer) clearInterval(timer);
  timer = null;
  sim = null;
}
export function startAgent(s: any) {
  stopAgent();
  sim = s; incidents = []; seq = 0; prev = null; lastPower = 0;
  spokenIds.clear();
  state.popupId = null; state.events = [];
  unsub = s.subscribe(onSnap);
  timer = setInterval(tick, 1000);
  agentEvent('NIA Watch started: monitoring pressure, flow, reservoirs and pumps.');
  onSnap();
  return stopAgent;
}