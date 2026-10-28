// @ts-nocheck
import { PLACES } from './niaMap';

let viewer: any = null;
let rail: any = null;
let pending: any[] = [];
let readyAt = 0;
let lineShow = true;
let trainShow = true;
let boxLines: any = null;
let boxTrains: any = null;

const C = () => (window as any).Cesium;
const alive = () => viewer && !(viewer.isDestroyed && viewer.isDestroyed());

function applyLayers() {
  if (!rail) return;
  rail.show = true;
  rail.entities.values.forEach((e: any) => {
    if (e.polyline) e.show = lineShow;
    else if (e.point) e.show = trainShow;
  });
}

function layerState(lines: boolean, trains: boolean) {
  lineShow = lines;
  trainShow = trains;
  if (boxLines) boxLines.checked = lines;
  if (boxTrains) boxTrains.checked = trains;
  applyLayers();
}

function buildControls(v: any) {
  const host = v.container;
  if (!host) return;
  host.querySelectorAll('.nia-map-controls').forEach((n: any) => n.remove());
  const panel = document.createElement('div');
  panel.className = 'nia-map-controls';
  panel.style.cssText = 'position:absolute;top:8px;left:8px;z-index:5;padding:8px 10px;border-radius:8px;background:rgba(4,22,36,0.88);border:1px solid rgba(34,211,238,0.5);color:#e6faff;font:12px sans-serif;line-height:1.6;max-width:230px;';
  panel.innerHTML =
    '<div style="letter-spacing:1px;font-size:10px;opacity:.7;margin-bottom:4px">MAP LAYERS</div>' +
    '<label style="display:block;cursor:pointer"><input type="checkbox" data-k="lines"> Rail lines <span style="opacity:.7">(real)</span></label>' +
    '<label style="display:block;cursor:pointer"><input type="checkbox" data-k="trains"> Trains <span style="color:#fbbf24">(simulated)</span></label>' +
    '<div style="margin-top:6px;font-size:10px;opacity:.8">Rail data \u00a9 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style="color:#22d3ee">OpenStreetMap</a> contributors</div>';
  host.appendChild(panel);
  boxLines = panel.querySelector('input[data-k="lines"]');
  boxTrains = panel.querySelector('input[data-k="trains"]');
  boxLines.checked = lineShow;
  boxTrains.checked = trainShow;
  boxLines.addEventListener('change', () => { lineShow = boxLines.checked; applyLayers(); });
  boxTrains.addEventListener('change', () => { trainShow = boxTrains.checked; applyLayers(); });
}

function drain() {
  const wait = Math.max(0, readyAt - Date.now());
  setTimeout(() => { const q = pending; pending = []; q.forEach(runMapCommand); }, wait);
}

export function registerMap(v: any) {
  if (viewer !== v) rail = null;
  viewer = v;
  buildControls(v);
  readyAt = Date.now() + 4000; // let the opening camera flight finish first
  drain();
}

export function setRailSource(src: any) { rail = src; applyLayers(); drain(); }

function flyPlace(p: any) {
  const Cesium = C();
  const offset = p.height / Math.tan(Cesium.Math.toRadians(-p.pitch)) / 111320;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(p.lon, p.lat - offset, p.height),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(p.pitch), roll: 0 },
    duration: 3.5,
  });
}

function move(f: number) {
  const Cesium = C();
  const cam = viewer.camera;
  const h = Math.max(150, cam.positionCartographic.height);
  const step = Cesium.Cartesian3.multiplyByScalar(cam.direction, h * f, new Cesium.Cartesian3());
  cam.flyTo({
    destination: Cesium.Cartesian3.add(cam.position, step, new Cesium.Cartesian3()),
    orientation: { heading: cam.heading, pitch: cam.pitch, roll: 0 },
    duration: 1.2,
  });
}

function frameRail() {
  const Cesium = C();
  const pts: any[] = [];
  rail.entities.values.forEach((e: any) => {
    if (!e.polyline) return;
    const p = e.polyline.positions.getValue(Cesium.JulianDate.now());
    if (p) for (const q of p) pts.push(q);
  });
  if (!pts.length) return;
  const s = Cesium.BoundingSphere.fromPoints(pts);
  viewer.camera.flyToBoundingSphere(s, {
    duration: 3.5,
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-55), s.radius * 2.2),
  });
}

async function geocode(q: string) {
  const Cesium = C();
  try {
    const svc = new Cesium.IonGeocoderService({ scene: viewer.scene });
    const res = await svc.geocode(q);
    const d = res && res[0] && res[0].destination;
    if (d) viewer.camera.flyTo({ destination: d, duration: 3.5 });
  } catch (e) { console.warn('Geocode failed', e); }
}

export function runMapCommand(cmd: { action: string; place?: string }) {
  const Cesium = C();
  if (!Cesium || !alive()) {
    pending.push(cmd);
    window.dispatchEvent(new Event('nia-open-map'));
    return;
  }
  const cam = viewer.camera;
  if (cmd.action !== 'follow_train' && cmd.action !== 'hide_rail') viewer.trackedEntity = undefined;
  switch (cmd.action) {
    case 'fly_to': {
      const key = (cmd.place ?? '').toLowerCase().trim();
      const p = PLACES[key] ?? PLACES[key.replace(/ (city|town|port)$/, '')];
      if (p) flyPlace(p); else geocode(cmd.place ?? '');
      break;
    }
    case 'reset_view': flyPlace(PLACES['windhoek']); break;
    case 'zoom_in': move(0.5); break;
    case 'zoom_out': move(-1); break;
    case 'top_down':
      cam.flyTo({ destination: cam.position.clone(), orientation: { heading: cam.heading, pitch: Cesium.Math.toRadians(-90), roll: 0 }, duration: 1.5 });
      break;
    case 'show_rail':
      if (!rail) { pending.push(cmd); return; }
      layerState(true, true); frameRail();
      break;
    case 'hide_rail': layerState(false, false); break;
    case 'follow_train': {
      if (!rail) { pending.push(cmd); return; }
      layerState(lineShow, true);
      const ent = rail.entities.values.find((e: any) => e.name === 'Simulated train ' + (Number(cmd.place) || 1));
      if (ent) {
        ent.viewFrom = new Cesium.ConstantProperty(new Cesium.Cartesian3(0, -900, 600));
        viewer.trackedEntity = ent;
      }
      break;
    }
    case 'stop_following': viewer.trackedEntity = undefined; break;
  }
}