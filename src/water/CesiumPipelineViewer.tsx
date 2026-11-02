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
        const CYAN = col('#22d3ee'), AMBER = col('#fbbf24'), ORANGE = col('#f97316'), RED = col('#ef4444'), DARKRED = col('#7f1d1d');
        const edgeEnts = new Map<string, any>();
        const glowEnts = new Map<string, any>();
        const nodeEnts = new Map<string, any>();

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
        const sync = () => {
          if (viewer.isDestroyed()) return;
          const blink = Math.floor(Date.now() / 500) % 2 === 0;
          for (const [id, ent] of edgeEnts) {
            const st = sim.getEdge(id);
            if (!st) continue;
            const sel = selRef.current === id;
            const key = st.status + (st.status === 'broken' ? (blink ? 'a' : 'b') : '') + (sel ? 's' : '');
            if (lastKey.get(id) === key) continue;
            lastKey.set(id, key);
            const color = st.status === 'broken' ? (blink ? RED : DARKRED) : st.status === 'critical' ? ORANGE : st.status === 'poor' ? AMBER : CYAN;
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
        };
        timer = setInterval(sync, 500);
        sync();

        handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((click: any) => {
          const hits = viewer.scene.drillPick(click.position, 6);
          for (const h of hits) {
            const raw = h && h.id && h.id.id;
            if (typeof raw === 'string') {
              const id = raw.replace(/^glow:/, '');
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
      } catch (e: any) {
        setMessage('Map failed to load: ' + String((e && e.message) || e));
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
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