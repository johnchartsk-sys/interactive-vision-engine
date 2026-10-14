export function Sparkline({ tone = '', seed = 1 }: { tone?: string; seed?: number }) {
 const points = Array.from({length:55},(_,i)=>`${i*3.7},${15+Math.sin(i*seed*1.31)*7+Math.sin(i*.6)*4}`).join(' ');
 return <svg className={`sparkline ${tone}`} viewBox="0 0 200 30" preserveAspectRatio="none" aria-hidden="true"><path className="gridline" d="M0 10H200M0 20H200M40 0V30M80 0V30M120 0V30M160 0V30"/><polyline points={points}/></svg>;
}
export function NamibiaNetwork(){
 const points=Array.from({length:38},(_,i)=>({x:70+(i*47)%210,y:35+(i*67)%345}));
 return <div className="nia-map"><svg viewBox="0 0 350 420" aria-label="Namibia infrastructure network"><defs><clipPath id="namibia-clip"><path d="M45 20L205 30L215 14L325 32L285 60L265 66L265 327L228 330L223 385L170 398L134 385L116 340L92 302L76 255L71 199L55 140Z"/></clipPath></defs><path className="map-shape" d="M45 20L205 30L215 14L325 32L285 60L265 66L265 327L228 330L223 385L170 398L134 385L116 340L92 302L76 255L71 199L55 140Z"/><g clipPath="url(#namibia-clip)">{points.map((p,i)=><g key={i}>{points.slice(i+1,i+5).map((q,j)=><line className="network-line" key={j} x1={p.x} y1={p.y} x2={q.x} y2={q.y}/>)}<circle className="network-node" cx={p.x} cy={p.y} r={i%4===0?4:2}/></g>)}</g></svg></div>;
}
