import { useEffect, useState } from 'react';

const CSS = `
@keyframes nia-cw{to{transform:rotate(360deg)}}
@keyframes nia-ccw{to{transform:rotate(-360deg)}}
@keyframes nia-pulse{0%,100%{transform:scale(1);opacity:.8}50%{transform:scale(1.07);opacity:1}}
@keyframes nia-bar{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}
@keyframes nia-blink{0%,100%{opacity:1}50%{opacity:.35}}
.nia-hud .spin{transform-origin:300px 300px;animation-timing-function:linear;animation-iteration-count:infinite}
.nia-hud .cw{animation-name:nia-cw}
.nia-hud .ccw{animation-name:nia-ccw}
.nia-hud .core{transform-origin:300px 300px;animation:nia-pulse 2.8s ease-in-out infinite}
.nia-hud.speaking .core{animation-duration:.55s}
.nia-hud .bar{transform-box:fill-box;transform-origin:50% 100%;animation:nia-bar 2.6s ease-in-out infinite;opacity:.55}
.nia-hud.speaking .bar{animation-duration:.5s;opacity:1}
.nia-hud .blink{animation:nia-blink 1.6s ease-in-out infinite}
`;

type RingProps = { r: number; w: number; dash?: string; dir: 'cw' | 'ccw'; secs: number; op: number; cyan: string; run: string };

function Ring({ r, w, dash, dir, secs, op, cyan, run }: RingProps) {
 return <circle className={`spin ${dir}`} cx={300} cy={300} r={r} fill="none" stroke={cyan} strokeWidth={w} strokeDasharray={dash} opacity={op} style={{ animationDuration: `${secs}s`, animationPlayState: run }} />;
}

export function NiaHologram({ autoRotate, wireframe, resetKey }: { autoRotate: boolean; wireframe: boolean; resetKey: number }) {
 const [cyan, setCyan] = useState<string | null>(null);
 const [speaking, setSpeaking] = useState(false);
 const [stats, setStats] = useState({ pwr: 98.4, grid: 99.1, load: 42 });

 useEffect(() => {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  const c = document.createElement('canvas').getContext('2d');
  if (!c || !v) { setCyan('#22d3ee'); return; }
  c.fillStyle = v; c.fillRect(0, 0, 1, 1);
  const p = c.getImageData(0, 0, 1, 1).data;
  setCyan(`rgb(${p[0]},${p[1]},${p[2]})`);
 }, []);

 useEffect(() => {
  const id = setInterval(() => setSpeaking(!!window.speechSynthesis?.speaking), 200);
  return () => clearInterval(id);
 }, []);

 useEffect(() => {
  const id = setInterval(() => setStats({
   pwr: +(97 + Math.random() * 2.5).toFixed(1),
   grid: +(98 + Math.random() * 1.9).toFixed(1),
   load: Math.round(30 + Math.random() * 30),
  }), 1500);
  return () => clearInterval(id);
 }, []);

 if (!cyan) return null;
 const run = autoRotate ? 'running' : 'paused';
 const mono = { fontFamily: 'Rajdhani, monospace' };

 return (
  <div className="nia-canvas" aria-label="Live NIA Jarvis HUD">
   <style>{CSS}</style>
   <svg key={resetKey} className={speaking ? 'nia-hud speaking' : 'nia-hud'} viewBox="0 0 600 600" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
    <defs>
     <radialGradient id="nia-core">
      <stop offset="0" stopColor="#ffffff" stopOpacity=".95" />
      <stop offset=".4" stopColor={cyan} stopOpacity=".85" />
      <stop offset="1" stopColor={cyan} stopOpacity=".1" />
     </radialGradient>
     <linearGradient id="nia-sweep" gradientUnits="userSpaceOnUse" x1="300" y1="0" x2="431" y2="0">
      <stop offset="0" stopColor={cyan} stopOpacity="0" />
      <stop offset="1" stopColor={cyan} stopOpacity=".5" />
     </linearGradient>
     <filter id="nia-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="b" />
      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
     </filter>
    </defs>

    {wireframe && (
     <g stroke={cyan} strokeWidth={1} opacity={0.22} strokeDasharray="4 6" fill="none">
      {[0, 45, 90, 135].map(a => <line key={a} x1={300} y1={15} x2={300} y2={585} transform={`rotate(${a} 300 300)`} />)}
      <circle cx={300} cy={300} r={75} />
      <circle cx={300} cy={300} r={160} />
     </g>
    )}

    <Ring r={285} w={8} dash="1.5 10.5" dir="cw" secs={90} op={0.7} cyan={cyan} run={run} />
    <Ring r={262} w={3} dash="200 60 40 60" dir="ccw" secs={40} op={0.9} cyan={cyan} run={run} />
    <Ring r={235} w={16} dash="150 90" dir="cw" secs={28} op={0.35} cyan={cyan} run={run} />
    <Ring r={205} w={1.5} dir="cw" secs={60} op={0.7} cyan={cyan} run={run} />
    <Ring r={178} w={6} dash="70 25 8 25" dir="ccw" secs={18} op={0.8} cyan={cyan} run={run} />
    <Ring r={140} w={2} dash="4 8" dir="cw" secs={50} op={0.7} cyan={cyan} run={run} />
    <Ring r={98} w={8} dash="60 20" dir="cw" secs={12} op={0.8} cyan={cyan} run={run} />

    <path className="spin cw" d="M300 300 L300 38 A262 262 0 0 1 431 73.1 Z" fill="url(#nia-sweep)" style={{ animationDuration: '5s', animationPlayState: run }} />

    {Array.from({ length: 40 }, (_, i) => (
     <g key={i} transform={`rotate(${i * 9} 300 300)`}>
      <rect className="bar" x={298.5} y={170} width={3} height={24} fill={cyan} style={{ animationDelay: `-${((i * 0.37) % 2.4).toFixed(2)}s` }} />
     </g>
    ))}

    <g className="spin cw" style={{ animationDuration: '20s', animationPlayState: run }}>
     {Array.from({ length: 8 }, (_, i) => (
      <line key={i} x1={300} y1={234} x2={300} y2={248} stroke={cyan} strokeWidth={3} transform={`rotate(${i * 45} 300 300)`} />
     ))}
    </g>

    <circle className="core" cx={300} cy={300} r={62} fill="url(#nia-core)" filter="url(#nia-glow)" />
    <circle cx={300} cy={300} r={48} fill="none" stroke={cyan} strokeWidth={2} opacity={0.9} />
    <text x={300} y={309} textAnchor="middle" fontSize={30} fontWeight={700} letterSpacing={5} fill="#ffffff" filter="url(#nia-glow)" style={mono}>NIA</text>
    <text className="blink" x={300} y={331} textAnchor="middle" fontSize={10} letterSpacing={3} fill="#ffffff" style={mono}>{speaking ? 'SPEAKING' : 'ONLINE'}</text>

    <g fill={cyan} fontSize={13} style={mono}>
     <text x={20} y={36}>PWR {stats.pwr}%</text>
     <text x={20} y={54}>GRID {stats.grid}%</text>
     <text x={580} y={36} textAnchor="end">LOAD {stats.load}%</text>
     <text x={580} y={54} textAnchor="end">LINK SECURE</text>
     <text x={20} y={575}>WINDHOEK 22.56°S 17.08°E</text>
     <text x={580} y={575} textAnchor="end">SIMULATED DATA</text>
    </g>
   </svg>
  </div>
 );
}