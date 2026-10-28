const OVERPASS = 'https://overpass-api.de/api/interpreter';
// Railway lines in a box around Windhoek (south, west, north, east)
const QUERY = '[out:json][timeout:25];way["railway"="rail"](-22.75,16.85,-22.45,17.30);out geom;';

export async function addRailLayer(viewer: any) {
  const Cesium = (window as any).Cesium;
  if (!Cesium || !viewer) return;
  try {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(QUERY),
    });
    if (!res.ok) throw new Error('Overpass returned ' + res.status);
    const data = await res.json();
    if (viewer.isDestroyed && viewer.isDestroyed()) return;

    const source = new Cesium.CustomDataSource('rail');
    for (const el of data.elements ?? []) {
      if (!el.geometry || el.geometry.length < 2) continue;
      const flat: number[] = el.geometry.flatMap((p: any) => [p.lon, p.lat]);
      source.entities.add({
        name: el.tags?.name ?? 'Railway line',
        description: 'Source: OpenStreetMap contributors (real track geometry)',
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(flat),
          width: 4,
          material: Cesium.Color.fromCssColorString('#fbbf24'),
          clampToGround: true,
        },
      });
    }
    viewer.dataSources.add(source);
  } catch (e) {
    console.warn('Rail layer failed to load', e);
  }
}