// @ts-nocheck
export type Row = [string, string];
export type WO = { id: string; title: string; status: string; when: string };

const T0 = Date.now();

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}
export function seed(id: string, salt: string): number { return hash(id + ':' + salt); }

// Step 3 (fault simulation) will write into this
export const faults: Record<string, { axleTemp: number }> = {};
export const workOrders: Record<string, WO[]> = {};

export function telemetry(id: string) {
  const t = (Date.now() - T0) / 1000;
  const ph = seed(id, 'ph') * 6.28;
  const fault = faults[id];
  return {
    speed: 52 + seed(id, 'sp') * 14 + 4 * Math.sin(t / 9 + ph),
    axle: fault ? fault.axleTemp : 54 + seed(id, 'ax') * 8 + 2.5 * Math.sin(t / 13 + ph),
    brake: 500 + 4 * Math.sin(t / 5 + ph),
    fuel: Math.max(5, 62 + seed(id, 'fu') * 33 - t * 0.02),
    dynBrake: Math.sin(t / 17 + ph) > 0.75,
  };
}

export function condition(id: string) {
  const { axle } = telemetry(id);
  const wear = seed(id, 'wear');
  const sinceService = 10 + Math.round(seed(id, 'svc') * 110);
  const wearPen = wear * 12;
  const svcPen = sinceService / 10;
  const tempPen = Math.min(60, Math.max(0, axle - 70) * 1.5);
  const score = Math.max(1, Math.min(100, Math.round(100 - wearPen - svcPen - tempPen)));
  const label = score >= 85 ? 'Optimal' : score >= 60 ? 'Watch' : 'Critical';
  const anomalies: Row[] = [];
  if (axle > 90) anomalies.push(['Axle bearing over temperature', Math.min(99, Math.round(70 + (axle - 90))) + '% confidence']);
  else if (axle > 70) anomalies.push(['Axle bearing temperature rising', '60% confidence']);
  return {
    score, label, anomalies,
    rulWheel: Math.round((1 - wear) * 900),
    rulMotor: Math.round((1 - seed(id, 'mot')) * 1500 + 200),
    factors: 'Starts at 100. Wheel wear -' + wearPen.toFixed(0) + ', service age (' + sinceService + ' days) -' + svcPen.toFixed(0) + ', axle temperature -' + tempPen.toFixed(0) + '.',
  };
}

export function maintenance(id: string, kind: string): WO[] {
  const types = kind === 'train'
    ? ['Wheelset inspection', 'Brake system service', 'Bearing lubrication', 'Traction motor check', 'Coupler inspection']
    : ['Track geometry inspection', 'Ballast tamping', 'Rail wear measurement', 'Sleeper replacement', 'Joint inspection'];
  const shift = Math.floor(seed(id, 'ty') * 5);
  const out: WO[] = [];
  const due = 5 + Math.round(seed(id, 'due') * 40);
  out.push({ id: 'WO-' + (1000 + Math.round(seed(id, 'wd') * 8999)), title: 'Routine inspection', status: 'Scheduled, due in ' + due + ' days', when: 'open' });
  for (let i = 0; i < 4; i++) {
    out.push({
      id: 'WO-' + (1000 + Math.round(seed(id, 'w' + i) * 8999)),
      title: types[(i + shift) % 5] ?? 'Inspection',
      status: 'Completed',
      when: (20 + i * 55 + Math.round(seed(id, 'm' + i) * 30)) + ' days ago',
    });
  }
  return [...(workOrders[id] ?? []), ...out];
}

export function createWorkOrder(id: string, title: string) {
  const list = workOrders[id] ?? [];
  workOrders[id] = [{ id: 'WO-' + (9001 + list.length), title, status: 'Open (created by operator)', when: 'just now' }, ...list];
}

export function trainContext(id: string): Row[] {
  return [
    ['Cargo weight', (800 + Math.round(seed(id, 'cg') * 900)) + ' t (simulated)'],
    ['Corridor speed limit', '60 km/h (assumed)'],
    ['Cargo manifest', 'Not connected'],
  ];
}

export function trackCondition(id: string): Row[] {
  const ballast = ['Good', 'Fair', 'Poor'][Math.floor(seed(id, 'bal') * 3)] ?? 'Fair';
  return [
    ['Ballast condition', ballast],
    ['Sleeper age', (5 + Math.round(seed(id, 'sl') * 30)) + ' years'],
    ['Rail wear', Math.round(seed(id, 'rw') * 35) + ' %'],
    ['Last geometry inspection', (10 + Math.round(seed(id, 'gi') * 170)) + ' days ago'],
    ['Washaway risk', 'Not assessed (NASA rain layer comes later)'],
  ];
}