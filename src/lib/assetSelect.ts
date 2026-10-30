// @ts-nocheck
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { selectAsset, getAsset, getSelectedId, subscribe } from './assetBus';
import { AssetPanel } from '../components/AssetPanel';

const handlers = new WeakMap();
let current: any = null;

function mountPanel() {
  if (document.getElementById('nia-asset-panel-root')) return;
  const host = document.createElement('div');
  host.id = 'nia-asset-panel-root';
  document.body.appendChild(host);
  createRoot(host).render(createElement(AssetPanel));
}

function unhighlight() {
  if (!current) return;
  const Cesium = (window as any).Cesium;
  if (current.polyline) {
    current.polyline.width = 4;
    current.polyline.material = Cesium.Color.fromCssColorString('#fbbf24');
  }
  if (current.point) {
    current.point.pixelSize = 12;
    current.point.outlineColor = Cesium.Color.WHITE;
  }
  current = null;
}

function highlight(ent: any) {
  const Cesium = (window as any).Cesium;
  if (ent.polyline) {
    ent.polyline.width = 9;
    ent.polyline.material = Cesium.Color.WHITE;
  }
  if (ent.point) {
    ent.point.pixelSize = 20;
    ent.point.outlineColor = Cesium.Color.fromCssColorString('#22d3ee');
  }
  current = ent;
}

export function enableAssetPicking(viewer: any) {
  if (handlers.has(viewer)) return;
  const Cesium = (window as any).Cesium;
  current = null;
  selectAsset(null);
  mountPanel();
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handlers.set(viewer, handler);

  handler.setInputAction((click: any) => {
    const hits = viewer.scene.drillPick(click.position, 8);
    let ent = null;
    for (const h of hits) {
      const e = h && h.id;
      if (e && e.id && getAsset(e.id)) { ent = e; break; }
    }
    unhighlight();
    if (ent) { highlight(ent); selectAsset(ent.id); } else { selectAsset(null); }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  handler.setInputAction((move: any) => {
    const p = viewer.scene.pick(move.endPosition);
    viewer.scene.canvas.style.cursor = p && p.id && p.id.id && getAsset(p.id.id) ? 'pointer' : 'default';
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  subscribe(() => { if (!getSelectedId()) unhighlight(); });

  // when the map is closed (Core view), clear the selection so the panel disappears
  const watch = setInterval(() => {
    if (viewer.isDestroyed && viewer.isDestroyed()) {
      clearInterval(watch);
      handlers.delete(viewer);
      selectAsset(null);
    }
  }, 1000);
}