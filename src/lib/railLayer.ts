// @ts-nocheck
import { registerMap, setRailSource } from './mapBus';
import { registerAsset } from './assetBus';
import { enableAssetPicking } from './assetSelect';

// Railway lines in a box around Windhoek (south, west, north, east)
const QUERY = '[out:json][timeout:25];way["railway"="rail"](-22.75,16.85,-22.45,17.30);out geom;';
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const CACHE_KEY = 'nia-rail-cache-v1';

const TRAIN_COUNT = 3;
// Sped up on purpose so movement is visible on screen. These trains are SIMULATED.
const SPEED_MPS = 60;

let memo: any = null;

function setStatus(viewer: any, text: string) {
  try {
    const box = viewer.container.querySelector('.nia-map-controls');
    if (!box) return;
    let s = box.querySelector('.nia-rail-status');
    if (!s) {
      s = document.createElement('div');
      s.className = 'nia-rail-status';
      s.style.cssText = 'margin-top:4px;font-size:10px;color:#fbbf24';
      box.appendChild(s);
    }
    s.textContent = text;
  } catch { /* status is optional */ }
}

async function fetchJson(url: string, init: any, ms: number) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}

// Order: memory, local snapshot in /public, browser cache, then live OpenStreetMap (two mirrors).
async function loadRail(status: (s: string) => void) {
  if (memo) return { data: memo, from: 'memory' };
  try {
    const d = await fetchJson('/rail-windhoek.json', {}, 8000);
    if (d && d.elements && d.elements.length) { memo = d; return { data: d, from: 'local snapshot' }; }
  } catch { /* no snapshot file */ }
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && c.data && Date.now() - c.at < 7 * 86400000) { memo = c.data; return { data: c.data, from: 'browser cache' }; }
    }
  } catch { /* cache is optional */ }
  let last = '';
  for (const url of MIRRORS) {
    try {
      status('Loading rail data from ' + new URL(url).host + '...');
      const d = await fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(QUERY) }, 25000);
      if (d && d.elements && d.elements.length) {
        memo = d;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: d })); } catch { /* too large or blocked */ }
        return { data: d, from: 'live OpenStreetMap' };
      }
      last = 'empty response';
    } catch (e: any) { last = String((e && e.message) || e); }
  }
  throw new Error('Rail data unavailable (' + last + ')');
}

function buildTrack(Cesium: any, el: any) {
  const pts = el.geometry.map((p: any) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Cesium.Cartesian3.distance(pts[i - 1], pts[i]));
  }
  return { pts, cum, length: cum[cum.length - 1], wayId: el.id };
}

function pointAt(Cesium: any, track: any, d: number) {
  const { pts, cum } = track;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (d - cum[i - 1]) / seg));
  return Cesium.Cartesian3.lerp(pts[i - 1], pts[i], t, new Cesium.Cartesian3());
}

export async function addRailLayer(viewer: any) {
  const Cesium = (window as any).Cesium;
  if (!Cesium || !viewer) return;
  registerMap(viewer);
  enableAssetPicking(viewer);
  setStatus(viewer, 'Loading rail data...');
  try {
    const { data, from } = await loadRail((t) => setStatus(viewer, t));
    if (viewer.isDestroyed && viewer.isDestroyed()) return;

    const source = new Cesium.CustomDataSource('rail');
    const tracks: any[] = [];

    for (const el of data.elements ?? []) {
      if (!el.geometry || el.geometry.length < 2) continue;
      const flat: number[] = el.geometry.flatMap((p: any) => [p.lon, p.lat]);
      const t = el.tags ?? {};
      const track = buildTrack(Cesium, el);
      const id = 'OSM-WAY-' + el.id;
      registerAsset({
        id,
        kind: 'track',
        name: t.name ?? 'Railway segment',
        simulated: false,
        props: [
          ['Asset ID', id],
          ['Source', 'OpenStreetMap (real)'],
          ['Length', (track.length / 1000).toFixed(2) + ' km'],
          ['Railway type', t.railway ?? 'not tagged'],
          ['Usage', t.usage ?? 'not tagged'],
          ['Gauge', t.gauge ? t.gauge + ' mm' : 'not tagged'],
          ['Electrified', t.electrified ?? 'not tagged'],
          ['Max speed', t.maxspeed ?? 'not tagged'],
        ],
      });
      source.entities.add({
        id,
        name: t.name ?? 'Railway line',
        description: 'Source: OpenStreetMap contributors (real track geometry)',
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(flat),
          width: 4,
          material: Cesium.Color.fromCssColorString('#fbbf24'),
          clampToGround: true,
        },
      });
      tracks.push(track);
    }

    // Simulated trains run back and forth on the longest real track segments
    const longest = tracks
      .filter((t) => t.length > 500)
      .sort((a, b) => b.length - a.length)
      .slice(0, TRAIN_COUNT);

    const start = Date.now();
    longest.forEach((track, n) => {
      const offset = (n * track.length) / 3;
      const id = 'SIM-LOCO-0' + (n + 1);
      const ent = source.entities.add({
        id,
        name: 'Simulated train ' + (n + 1),
        description: 'SIMULATED train. Not real train data. Runs on real OpenStreetMap track.',
        position: new Cesium.CallbackProperty(() => {
          const elapsed = (Date.now() - start) / 1000;
          const phase = (elapsed * SPEED_MPS + offset) % (2 * track.length);
          const d = phase < track.length ? phase : 2 * track.length - phase;
          return pointAt(Cesium, track, d);
        }, false),
        point: {
          pixelSize: 12,
          color: Cesium.Color.fromCssColorString('#22d3ee'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: 'SIM TRAIN ' + (n + 1),
          font: '12px sans-serif',
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#04162488'),
          pixelOffset: new Cesium.Cartesian2(0, -20),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      registerAsset({
        id,
        kind: 'train',
        trainNo: n + 1,
        name: 'Simulated locomotive ' + (n + 1),
        simulated: true,
        props: [
          ['Asset ID', id],
          ['Type', 'Locomotive (simulated)'],
          ['Runs on', 'OSM way ' + track.wayId + ' (real track)'],
          ['Route length', (track.length / 1000).toFixed(1) + ' km'],
          ['Movement', 'Back and forth, sped up for visibility'],
        ],
        live: () => {
          const p = ent.position.getValue(Cesium.JulianDate.now());
          if (!p) return [];
          const c = Cesium.Cartographic.fromCartesian(p);
          return [
            ['Latitude', Cesium.Math.toDegrees(c.latitude).toFixed(5)],
            ['Longitude', Cesium.Math.toDegrees(c.longitude).toFixed(5)],
          ];
        },
      });
    });

    viewer.dataSources.add(source);
    setRailSource(source);
    setStatus(viewer, 'Rail data: ' + from + ' (' + tracks.length + ' segments)');
  } catch (e: any) {
    console.warn('Rail layer failed to load', e);
    setStatus(viewer, String((e && e.message) || e));
  }
}