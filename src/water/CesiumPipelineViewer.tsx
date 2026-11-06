// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import type { WaterSimulation } from './engine';
import { isEdgeFeature, isNodeFeature } from './types';

const BASE = 'https://cdn.jsdelivr.net/npm/cesium@1.120.0/Build/Cesium/';

function loadCesium(): Promise<any> {
  const w = window as any;
  if (w.Cesium) return Promise.resolve(w.Cesium);
  if (w.__cesiumLoading) return w.__cesiumLoading;
  w.CESIUM_BASE_URL = BASE;
  w.__cesiumLoading = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${BASE}Widgets/widgets.css`;
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = `${BASE}Cesium.js`;
    s.onload = () => resolve(w.Cesium);
    s.onerror = () => reject(new Error('Could not load Cesium from the CDN'));
    document.head.appendChild(s);
  });
  return w.__cesiumLoading;
}

const LETTER = { TreatmentPlant: 'T', PumpStation: 'P', Reservoir: 'R', DemandPoint: 'D' } as const;
const icon = (letter: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" fill="#ffffff" stroke="#0b1f2e" stroke-width="3"/><text x="22" y="29" font-family="sans-serif" font-size="20" font-weight="700" text-anchor="middle" fill="#0b1f2e">${letter}</text></svg>`,
  );

type Track = { pts: any[]; cum: number[]; length: number };

// Insert points roughly every stepM metres so terrain heights can be sampled along the pipe.
function densify(coords: number[][], stepM: number): number[][] {
  const out: number[][] = [];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const dx = (b[0] - a[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180);
    const dy = (b[1] - a[1]) * 110540;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / stepM));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  const last = coords[coords.length - 1];
  out.push([last[0], last[1]]);
  return out;
}

function pointAt(Cesium: any, tr: Track, d: number) {
  const { pts, cum } = tr;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (d - cum[i - 1]) / seg));
  return Cesium.Cartesian3.lerp(pts[i - 1], pts[i], t, new Cesium.Cartesian3());
}

interface Props {
  sim: WaterSimulation;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focus: { id: string; n: number } | null;
}

export function CesiumPipelineViewer({ sim, selectedId, onSelect, focus }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const selRef = useRef<string | null>(selectedId);
  const onSelectRef = useRef(onSelect);
  const [message, setMessage] = useState('Loading 3D map...');
  selRef.current = selectedId;
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    let viewer: any = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let handler: any = null;
    let removePre: (() => void) | null = null;

    (async () => {
      try {
        const token = (import.meta as any).env['VITE_CESIUM_TOKEN'] as string | undefined;
        if (!token) { setMessage('Cesium token missing. Add VITE_CESIUM_TOKEN to .env.local and restart the server.'); return; }
        const Cesium = await loadCesium();
        if (cancelled || !hostRef.current) return;
        Cesium.Ion.defaultAccessToken = token;
        viewer = new Cesium.Viewer(hostRef.current, {
          terrain: Cesium.Terrain.fromWorldTerrain(),
          baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false,
          animation: false, timeline: false, fullscreenButton: false, infoBox: false, selectionIndicator: false,
        });
        viewerRef.current = viewer;
        try {
          const b = await Cesium.createOsmBuildingsAsync();
          if (!cancelled && !viewer.isDestroyed()) viewer.scene.primitives.add(b);
        } catch { /* buildings are optional */ }

        const col = (hex: string) => Cesium.Color.fromCssColorString(hex);
        const CYAN = col('#22d3ee'), AMBER = col('#fbbf24'), ORANGE = col('#f97316'), RED = col('#ef4444'), DARKRED = col('#7f1d1d'), FLOW = col('#e0f7ff');
        const edgeEnts = new Map<string, any>();
        const glowEnts = new Map<string, any>();
        const nodeEnts = new Map<string, any>();
        const tracks = new Map<string, Track>();
        const phase = new Map<string, number>();
        const particles = new Map<string, any[]>();
        const leakEnts = new Map<string, any>();

        for (const f of sim.network.features) {
          if (isEdgeFeature(f)) {
            const p = f.properties;
            const pos = Cesium.Cartesian3.fromDegreesArray(f.geometry.coordinates.flat());
            const w = 3 + p.diameterMm / 110;
            glowEnts.set(p.id, viewer.entities.add({ id: 'glow:' + p.id, polyline: { positions: pos, width: w + 8, material: CYAN.withAlpha(0.22), clampToGround: true } }));
            edgeEnts.set(p.id, viewer.entities.add({ id: p.id, name: p.name, polyline: { positions: pos, width: w, material: CYAN, clampToGround: true } }));
          } else if (isNodeFeature(f)) {
            const p = f.properties;
            const [lon, lat] = f.geometry.coordinates;
            nodeEnts.set(p.id, viewer.entities.add({
              id: p.id, name: p.name, position: Cesium.Cartesian3.fromDegrees(lon, lat),
              billboard: {
                image: icon(LETTER[p.nodeType]), width: 34, height: 34, color: CYAN,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
              label: {
                text: p.name, font: '12px sans-serif', fillColor: Cesium.Color.WHITE, showBackground: true,
                backgroundColor: col('#04162499'), pixelOffset: new Cesium.Cartesian2(0, 28),
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 22000),
              },
            }));
          }
        }

        // Re-colour only when state changes (blinking red for broken, amber for poor, cyan for normal).
        const lastKey = new Map<string, string>();
        const flowKey = new Map<string, string>();
        const sync = () => {
          if (viewer.isDestroyed()) return;
          const blink = Math.floor(Date.now() / 500) % 2 === 0;
          for (const [id, ent] of edgeEnts) {
            const st = sim.getEdge(id);
            if (!st) continue;
            const sel = selRef.current === id;
            const key = st.status + (st.status === 'broken' ? (blink ? 'a' : 'b') : '') + (sel ? 's' : '') + (st.closed ? 'c' : '');
            if (lastKey.get(id) === key) continue;
            lastKey.set(id, key);
            const color = st.closed ? col('#94a3b8') : st.status === 'broken' ? (blink ? RED : DARKRED): st.status === 'critical' ? ORANGE : st.status === 'poor' ? AMBER : CYAN;
            const w = 3 + st.diameterMm / 110 + (sel ? 4 : 0);
            ent.polyline.material = color;
            ent.polyline.width = w;
            const g = glowEnts.get(id);
            if (g) { g.polyline.material = color.withAlpha(sel ? 0.4 : 0.22); g.polyline.width = w + 8; }
          }
          for (const [id, ent] of nodeEnts) {
            const st = sim.getNode(id);
            if (!st) continue;
            const sel = selRef.current === id;
            const key = st.health + (st.health === 'alert' || st.health === 'down' ? (blink ? 'a' : 'b') : '') + (sel ? 's' : '');
            if (lastKey.get(id) === key) continue;
            lastKey.set(id, key);
            ent.billboard.color = st.health === 'ok' ? CYAN : st.health === 'warn' ? AMBER : blink ? RED : DARKRED;
            ent.billboard.scale = sel ? 1.35 : 1;
          }
          // flow particles take the colour of their pipe's status; broken pipes show a pulsing leak marker
          for (const [id, list] of particles) {
            const st = sim.getEdge(id);
            if (!st) continue;
            const lk = leakEnts.get(id);
            if (lk) lk.show = st.status === 'broken' && !st.closed;
            /* particle colours refresh every sync */
            flowKey.set(id, st.status);
            const c = st.status === 'broken' ? RED : st.status === 'critical' ? ORANGE : st.status === 'poor' ? AMBER : FLOW;
            for (const e of list) { e.point.color = c; e.show = !st.closed; }
          }
        };
        timer = setInterval(sync, 500);
        sync();

        handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((click: any) => {
          const hits = viewer.scene.drillPick(click.position, 8);
          for (const h of hits) {
            const raw = h && h.id && h.id.id;
            if (typeof raw === 'string') {
              const id = raw.replace(/^(glow|flow|leak):/, '').split(':')[0];
              if (sim.getEdge(id) || sim.getNode(id)) { onSelectRef.current(id); return; }
            }
          }
          onSelectRef.current(null);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        handler.setInputAction((move: any) => {
          const p = viewer.scene.pick(move.endPosition);
          viewer.scene.canvas.style.cursor = p && p.id && p.id.id ? 'pointer' : 'default';
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(17.072, -22.653, 16000),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 },
        });
        setMessage('');

        // ---- flow animation: built after the map is shown, so a failure here never blocks the map ----
        const buildFlow = async () => {
          let provider: any = null;
          try { provider = await Cesium.createWorldTerrainAsync(); } catch { provider = null; }
          for (const f of sim.network.features) {
            if (!isEdgeFeature(f)) continue;
            const p = f.properties;
            const dense = densify(f.geometry.coordinates as number[][], 120);
            const carts = dense.map((c) => Cesium.Cartographic.fromDegrees(c[0], c[1]));
            let sampled = false;
            if (provider) {
              try { await Cesium.sampleTerrainMostDetailed(provider, carts); sampled = true; } catch { sampled = false; }
            }
            if (cancelled || viewer.isDestroyed()) return;
            const a = sim.getNode(p.from);
            const b = sim.getNode(p.to);
            const pts = carts.map((c: any, i: number) => {
              // Namibian highlands are well above 800 m, so a lower value means the sample failed
              const good = sampled && typeof c.height === 'number' && c.height > 800;
              const h = good ? c.height : a && b ? a.elevationM + (b.elevationM - a.elevationM) * (i / Math.max(1, carts.length - 1)) : 1640;
              return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, h + 3);
            });
            const cum = [0];
            for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Cesium.Cartesian3.distance(pts[i - 1], pts[i]));
            const track: Track = { pts, cum, length: cum[cum.length - 1] };
            tracks.set(p.id, track);
            phase.set(p.id, 0);

            const n = Math.max(4, Math.min(14, Math.round(track.length / 500)));
            const list: any[] = [];
            for (let k = 0; k < n; k++) {
              list.push(viewer.entities.add({
                id: 'flow:' + p.id + ':' + k,
                position: new Cesium.CallbackProperty(() => {
                  const frac = (((phase.get(p.id) ?? 0) / track.length) + k / n) % 1;
                  return pointAt(Cesium, track, frac * track.length);
                }, false),
                point: { pixelSize: Math.min(10, 4 + p.diameterMm / 120), color: FLOW, disableDepthTestDistance: Number.POSITIVE_INFINITY },
              }));
            }
            particles.set(p.id, list);

            leakEnts.set(p.id, viewer.entities.add({
              id: 'leak:' + p.id,
              show: false,
              position: pointAt(Cesium, track, track.length / 2),
              point: {
                pixelSize: new Cesium.CallbackProperty(() => 16 + 10 * Math.abs(Math.sin(Date.now() / 250)), false),
                color: RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
              label: {
                text: 'LEAK', font: 'bold 12px sans-serif', fillColor: Cesium.Color.WHITE, showBackground: true,
                backgroundColor: DARKRED.withAlpha(0.85), pixelOffset: new Cesium.Cartesian2(0, -24), disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            }));
          }

          // advance the particles every frame; speed follows simulated flow against capacity (visual scaling only)
          let last = performance.now();
          removePre = viewer.scene.preRender.addEventListener(() => {
            const now = performance.now();
            const dt = Math.min(0.1, (now - last) / 1000);
            last = now;
            const snap = sim.getSnapshot();
            if (!snap.running) return;
            const speedFactor = snap.minutesPerTick / 6;
            for (const [id, tr] of tracks) {
              const st = sim.getEdge(id);
              if (!st) continue;
              const v = st.status === 'broken' ? 25 : 40 + 260 * Math.min(1, st.utilisation);
              phase.set(id, ((phase.get(id) ?? 0) + v * dt * speedFactor) % tr.length);
            }
          });
          sync();
        };
        buildFlow().catch((e: any) => console.warn('Flow animation failed', e));
      } catch (e: any) {
        setMessage('Map failed to load: ' + String((e && e.message) || e));
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (removePre) removePre();
      if (handler) handler.destroy();
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
    };
  }, [sim]);

  // fly to an asset chosen from the dashboard lists
  useEffect(() => {
    const v = viewerRef.current;
    const Cesium = (window as any).Cesium;
    if (!focus || !v || !Cesium || v.isDestroyed()) return;
    const node = sim.getNode(focus.id);
    const edge = sim.getEdge(focus.id);
    if (node) {
      v.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(node.lon, node.lat, node.elevationM), 200), {
        duration: 2.5, offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 2200),
      });
    } else if (edge) {
      const a = sim.getNode(edge.from);
      const b = sim.getNode(edge.to);
      const h = a && b ? (a.elevationM + b.elevationM) / 2 : 1640;
      const flat: number[] = edge.coords.flatMap((c) => [c[0], c[1], h]);
      const s = Cesium.BoundingSphere.fromPoints(Cesium.Cartesian3.fromDegreesArrayHeights(flat));
      v.camera.flyToBoundingSphere(s, { duration: 2.5, offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), Math.max(s.radius * 3, 1800)) });
    }
  }, [focus, sim]);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="absolute inset-0" />
      {message && <div className="absolute inset-0 z-10 grid place-items-center bg-slate-950/80 p-6 text-center text-sm text-slate-200">{message}</div>}
    </div>
  );
}