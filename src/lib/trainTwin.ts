// @ts-nocheck
let current: any = null;

export function closeTrainTwin() {
  if (current) current.close();
}

export function openTrainTwin(id: string, viewer?: any) {
  if (current) return;
  const n = (String(id).match(/(\d)$/) || [])[1] || '2';
  const name = 'SIM-LOCO-0' + n;

  const back = document.createElement('div');
  back.id = 'nia-train-twin';
  back.style.cssText = 'position:fixed;inset:0;z-index:500;background:rgba(0,10,20,0.75);display:flex;align-items:center;justify-content:center';

  const box = document.createElement('div');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', name + ' 3D view');
  box.style.cssText = 'width:min(1500px,96vw);height:94vh;display:flex;flex-direction:column;border:2px solid #22d3ee;border-radius:12px;overflow:hidden;background:#031220;box-shadow:0 0 60px rgba(0,0,0,.8),0 0 28px rgba(34,211,238,.4)';

  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;gap:12px;padding:6px 12px;background:#02101c;border-bottom:1px solid #12435f;color:#e6f4ff;font:12px sans-serif';
  const title = document.createElement('b');
  title.style.fontSize = '14px';
  title.textContent = name + ' \u00b7 3D train view';
  const tag = document.createElement('span');
  tag.style.cssText = 'color:#fbbf24';
  tag.textContent = 'SIMULATED train model, no real train data';
  const x = document.createElement('button');
  x.textContent = 'Close (Esc)';
  x.style.cssText = 'margin-left:auto;cursor:pointer;color:#e6f4ff;background:#0c3552;border:1px solid #22d3ee;border-radius:7px;padding:4px 12px;font:inherit';
  bar.append(title, tag, x);

  const frame = document.createElement('iframe');
  frame.title = name + ' simulated train, 3D view';
  frame.src = '/rail-twin.html?train=' + n;
  frame.style.cssText = 'flex:1;width:100%;border:0;background:#031220';

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  function close() {
    document.removeEventListener('keydown', onKey);
    back.remove();
    current = null;
    try { if (viewer && !viewer.isDestroyed()) viewer.useDefaultRenderLoop = true; } catch { /* map resumes next time */ }
  }
  frame.addEventListener('load', () => {
    try { frame.contentWindow.addEventListener('keydown', onKey); frame.contentWindow.focus(); } catch { /* same origin only */ }
  });
  x.onclick = close;
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);

  box.append(bar, frame);
  back.append(box);
  document.body.appendChild(back);
  // pause the map while the train is open, so the PC only draws one 3D scene
  try { if (viewer && !viewer.isDestroyed()) viewer.useDefaultRenderLoop = false; } catch { /* optional */ }
  current = { close };
}