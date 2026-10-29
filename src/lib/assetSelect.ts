// @ts-nocheck
import { selectAsset, getAsset, getSelectedId, subscribe } from './assetBus';

const handlers = new WeakMap();
let current: any = null;

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
}