// @ts-nocheck
import { useEffect, useState } from 'react';
import { useWeather, loadWeather } from '@/lib/nasaWeather';

const COL = { Low: '#34d399', Moderate: '#fbbf24', High: '#f87171' };

function Row({ k, v, c }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <span style={{ opacity: 0.7 }}>{k}</span>
      <span style={{ color: c || '#e6faff', fontWeight: c ? 700 : 400, textAlign: 'right' }}>{v}</span>
    </div>
  );
}

export function WeatherCard() {
  const w = useWeather();
  const [open, setOpen] = useState(false);
  useEffect(() => { loadWeather(); }, []);

  const col = w.overall ? COL[w.overall] : '#9ca3af';
  const label = w.status === 'ok' ? 'Rail weather risk: ' + w.overall : w.status === 'error' ? 'Weather data unavailable' : 'Loading weather...';
  const bars = [...w.days.map((d) => ({ ...d, kind: 'obs', prob: null })), ...w.fdays.map((d) => ({ ...d, kind: 'fc' }))];
  const mx = Math.max(10, ...bars.map((b) => b.rain));
  const step = 230 / Math.max(1, bars.length);

  return (
    <div style={{ width: open ? 260 : 'auto', maxWidth: 270, padding: '6px 10px', borderRadius: 8, background: 'rgba(4,22,36,0.93)', border: '1px solid ' + col, color: '#e6faff', font: '12px sans-serif', lineHeight: 1.5 }}>
      <div onClick={() => setOpen((o) => !o)} style={{ cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ letterSpacing: 1, fontSize: 10, opacity: 0.7 }}>WEATHER</span>
        <span style={{ color: col, fontWeight: 700 }}>{'\u25cf'} {label}</span>
        <span style={{ marginLeft: 'auto' }}>{open ? '\u2212' : '+'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 6 }}>
          {w.status === 'error' && <div style={{ color: '#f87171' }}>{w.error}</div>}
          {w.status === 'ok' && (
            <div>
              <svg width="240" height="46" role="img" aria-label="Daily rainfall, 7 days observed and 3 days forecast">
                {bars.map((b, i) => {
                  const h = Math.max(1, (b.rain / mx) * 38);
                  return (
                    <rect key={b.kind + b.date} x={i * step + 2} y={42 - h} width={Math.max(6, step - 4)} height={h} fill={b.kind === 'fc' ? '#fbbf24' : '#22d3ee'}>
                      <title>{b.date + ': ' + b.rain.toFixed(1) + ' mm' + (b.kind === 'fc' ? ' forecast' + (b.prob !== null ? ', ' + b.prob + '% chance' : '') : ' observed')}</title>
                    </rect>
                  );
                })}
              </svg>
              <div style={{ fontSize: 10, marginBottom: 4 }}>
                <span style={{ color: '#22d3ee' }}>{'\u25a0'} Observed, NASA POWER</span>{'  '}
                <span style={{ color: '#fbbf24' }}>{'\u25a0'} Forecast, Open-Meteo</span>
              </div>
              {w.obs && <Row k="Rain, last 7 days" v={w.obs.rain7.toFixed(0) + ' mm (wettest ' + w.obs.rainMax.toFixed(0) + ')'} />}
              {w.obs && <Row k="Hottest day, observed" v={w.obs.tmax7.toFixed(0) + ' \u00b0C'} />}
              {w.fc && <Row k="Rain, next 3 days" v={w.fc.rain3.toFixed(0) + ' mm (wettest ' + w.fc.rainMax.toFixed(0) + ')'} />}
              {w.fc && w.fc.probMax !== null && <Row k="Rain chance, up to" v={w.fc.probMax + ' %'} />}
              {w.fc && <Row k="Hottest day, forecast" v={w.fc.tmax3.toFixed(0) + ' \u00b0C'} />}
              {w.obs && <Row k="Washaway risk, now" v={w.obs.wash} c={COL[w.obs.wash]} />}
              {w.fc && <Row k="Washaway risk, forecast" v={w.fc.wash} c={COL[w.fc.wash]} />}
              {w.obs && <Row k="Heat stress, now" v={w.obs.heat} c={COL[w.obs.heat]} />}
              {w.fc && <Row k="Heat stress, forecast" v={w.fc.heat} c={COL[w.fc.heat]} />}
              {w.trend && <div style={{ marginTop: 6, fontWeight: 700, color: col }}>{w.trend}</div>}
              {w.obs && <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>Observed data up to {w.obs.asOf}.</div>}
            </div>
          )}
          {w.notes.map((n, i) => <div key={i} style={{ fontSize: 10, color: '#f87171', marginTop: 3 }}>{n}</div>)}
          <div style={{ fontSize: 10, opacity: 0.7, marginTop: 6 }}>
            Thresholds are assumed, for demonstration. Washaway: moderate from 10 mm in a day or 25 mm over the period, high from 25 mm or 60 mm. Heat: moderate from 35 {'\u00b0C'}, high from 40 {'\u00b0C'}.
          </div>
          <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>
            Observed: NASA POWER, roughly 50 km grid, a few days behind. Forecast: Open-Meteo, model-based, can be wrong. Same value for the whole corridor.
          </div>
          <button onClick={() => loadWeather(true)} style={{ marginTop: 6, padding: '3px 8px', borderRadius: 6, border: '1px solid #22d3ee', background: 'rgba(34,211,238,0.12)', color: '#e6faff', cursor: 'pointer', fontSize: 11 }}>Refresh</button>
        </div>
      )}
    </div>
  );
}