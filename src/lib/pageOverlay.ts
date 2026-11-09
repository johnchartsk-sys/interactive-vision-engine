// @ts-nocheck
let current: any = null;

export function closePage() {
  if (current) current.close();
}

export function openPage(url: string, title: string, note?: string) {
  if (current) return;
  const back = document.createElement('div');
  back.style.cssText = 'position:fixed;inset:0;z-index:500;background:rgba(0,10,20,0.75);display:flex;align-items:center;justify-content:center';

  const box = document.createElement('div');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', title);
  box.style.cssText = 'width:min(1600px,97vw);height:95vh;display:flex;flex-direction:column;border:2px solid #22d3ee;border-radius:12px;overflow:hidden;background:#031220;box-shadow:0 0 60px rgba(0,0,0,.8),0 0 28px rgba(34,211,238,.4)';

  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;gap:12px;padding:6px 12px;background:#02101c;border-bottom:1px solid #12435f;color:#e6f4ff;font:12px sans-serif';
  const t = document.createElement('b');
  t.style.fontSize = '14px';
  t.textContent = title;
  const tag = document.createElement('span');
  tag.style.cssText = 'color:#fbbf24';
  tag.textContent = note || 'DEMONSTRATION with simulated data';
  const x = document.createElement('button');
  x.textContent = 'Close';
  x.style.cssText = 'margin-left:auto;cursor:pointer;color:#e6f4ff;background:#0c3552;border:1px solid #22d3ee;border-radius:7px;padding:4px 14px;font:inherit';
  bar.append(t, tag, x);

  const frame = document.createElement('iframe');
  frame.title = title;
  frame.src = url;
  frame.style.cssText = 'flex:1;width:100%;border:0;background:#ffffff';

  // Esc closes only when focus is on the platform. Inside the dashboard, Esc is left to its own pop-ups.
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  function close() {
    document.removeEventListener('keydown', onKey);
    back.remove();
    current = null;
  }
  x.onclick = close;
  document.addEventListener('keydown', onKey);

  box.append(bar, frame);
  back.append(box);
  document.body.appendChild(back);
  current = { close };
}