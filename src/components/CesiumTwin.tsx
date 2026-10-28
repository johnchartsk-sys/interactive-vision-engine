import { useEffect, useRef, useState } from 'react';

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
    s.onerror = () => reject(new Error('Could not load the 3D map library. Check your internet connection.'));
    document.head.appendChild(s);
  });
  return w.__cesiumLoading;
}

export function CesiumTwin({ onReady }: { onReady?: (viewer: any) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('Loading Windhoek 3D twin…');

  useEffect(() => {
    let viewer: any;
    let cancelled = false;
    (async () => {
      try {const token = import.meta.env['VITE_CESIUM_TOKEN'] as string | undefined;
        if (!token) throw new Error('Cesium token missing. Add VITE_CESIUM_TOKEN to .env.local and restart the server.');
        const Cesium = await loadCesium();
        if (cancelled || !box.current) return;
        Cesium.Ion.defaultAccessToken = token;
        viewer = new Cesium.Viewer(box.current, {
          terrain: Cesium.Terrain.fromWorldTerrain(),
          baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
          navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
          infoBox: false, selectionIndicator: false,
        });
        try {
          const buildings = await Cesium.createOsmBuildingsAsync();
          if (!cancelled) viewer.scene.primitives.add(buildings);
        } catch { /* buildings are optional */ }
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(17.0658, -22.595, 2200),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-35), roll: 0 },
          duration: 3,
        });
        setMessage('');
        onReady?.(viewer);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'The 3D map could not start.');
      }
    })();
    return () => { cancelled = true; try { viewer?.destroy(); } catch { /* ignore */ } };
  }, []);

  return (
    <div className="nia-canvas" style={{ position: 'relative', width: '100%', height: '480px', minHeight: '480px' }}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      {message && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 2, display: 'grid', placeItems: 'center', padding: 16, textAlign: 'center', color: '#9fe7ff', background: 'rgba(0,12,20,.85)' }}>
          {message}
        </div>
      )}
    </div>
  );
}