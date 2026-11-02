// @ts-nocheck
import { useSyncExternalStore } from 'react';

export type Level = 'Low' | 'Moderate' | 'High';
export type Weather = {
  status: 'idle' | 'loading' | 'ok' | 'error';
  error?: string;
  notes: string[];
  days: { date: string; rain: number; tmax: number }[];
  obs?: { asOf: string; rain7: number; rainMax: number; tmax7: number; wash: Level; heat: Level };
  fdays: { date: string; rain: number; prob: number | null; tmax: number }[];
  fc?: { rain3: number; rainMax: number; tmax3: number; probMax: number | null; wash: Level; heat: Level };
  overall?: Level;
  trend?: string;
};

// Centre of the rail data box around Windhoek
const LAT = -22.6;
const LON = 17.075;

let state: Weather = { status: 'idle', notes: [], days: [], fdays: [] };
let fetchedAt = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());
function set(next: Weather) { state = next; emit(); }

export function useWeather(): Weather {
  return useSyncExternalStore(
    (l) => { subs.add(l); return () => { subs.delete(l); }; },
    () => state,
    () => state,
  );
}

const ymd = (d: Date) => d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
const dash = (d: string) => d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8);
const rank = { Low: 0, Moderate: 1, High: 2 };
const lvl = (v: number, mod: number, high: number): Level => (v >= high ? 'High' : v >= mod ? 'Moderate' : 'Low');
const worst = (a: Level, b: Level): Level => (rank[a] >= rank[b] ? a : b);
const msg = (e: any) => String((e && e.message) || e);

async function loadObserved() {
  let json: any = null;
  let lastErr = '';
  for (const back of [1, 3, 7]) {
    const end = new Date(Date.now() - back * 86400000);
    const start = new Date(end.getTime() - 20 * 86400000);
    const url = 'https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M,T2M_MAX&community=AG'
      + '&longitude=' + LON + '&latitude=' + LAT + '&start=' + ymd(start) + '&end=' + ymd(end) + '&format=JSON';
    try {
      const res = await fetch(url);
      if (!res.ok) { lastErr = 'NASA POWER returned ' + res.status; continue; }
      json = await res.json();
      break;
    } catch (e: any) { lastErr = msg(e); break; }
  }
  if (!json) throw new Error(lastErr || 'No response');
  const p = json.properties.parameter;
  const days: Weather['days'] = [];
  for (const d of Object.keys(p.PRECTOTCORR || {}).sort()) {
    const rain = p.PRECTOTCORR[d], tmax = p.T2M_MAX[d];
    if ([rain, tmax].some((v) => v === undefined || v === null || v <= -900)) continue;
    days.push({ date: dash(d), rain, tmax });
  }
  if (days.length < 3) throw new Error('Too little valid data returned');
  const last = days.slice(-7);
  const rain7 = last.reduce((s, d) => s + d.rain, 0);
  const rainMax = Math.max(...last.map((d) => d.rain));
  const tmax7 = Math.max(...last.map((d) => d.tmax));
  const obs = { asOf: last[last.length - 1].date, rain7, rainMax, tmax7, wash: worst(lvl(rainMax, 10, 25), lvl(rain7, 25, 60)), heat: lvl(tmax7, 35, 40) };
  return { days: last, obs };
}

async function loadForecast() {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON
    + '&daily=precipitation_sum,precipitation_probability_max,temperature_2m_max&forecast_days=3&timezone=auto';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Open-Meteo returned ' + res.status);
  const j = await res.json();
  const d = j.daily;
  if (!d || !d.time) throw new Error('No forecast data returned');
  const fdays = d.time
    .map((t: string, i: number) => ({
      date: t,
      rain: d.precipitation_sum[i] == null ? 0 : d.precipitation_sum[i],
      prob: d.precipitation_probability_max && d.precipitation_probability_max[i] != null ? d.precipitation_probability_max[i] : null,
      tmax: d.temperature_2m_max[i],
    }))
    .filter((x: any) => typeof x.tmax === 'number');
  if (!fdays.length) throw new Error('No forecast data returned');
  const rain3 = fdays.reduce((s: number, x: any) => s + x.rain, 0);
  const rainMax = Math.max(...fdays.map((x: any) => x.rain));
  const tmax3 = Math.max(...fdays.map((x: any) => x.tmax));
  const probs = fdays.map((x: any) => x.prob).filter((x: any) => x !== null);
  const fc = {
    rain3, rainMax, tmax3,
    probMax: probs.length ? Math.max(...probs) : null,
    wash: worst(lvl(rainMax, 10, 25), lvl(rain3, 25, 60)),
    heat: lvl(tmax3, 35, 40),
  };
  return { fdays, fc };
}

export async function loadWeather(force = false) {
  if (!force && (state.status === 'loading' || (state.status === 'ok' && Date.now() - fetchedAt < 30 * 60 * 1000))) return;
  set({ ...state, status: 'loading', error: undefined });
  const [o, f] = await Promise.allSettled([loadObserved(), loadForecast()]);
  const notes: string[] = [];
  let days: Weather['days'] = [];
  let fdays: Weather['fdays'] = [];
  let obs: Weather['obs'];
  let fc: Weather['fc'];
  if (o.status === 'fulfilled') { days = o.value.days; obs = o.value.obs; } else notes.push('Observed (NASA POWER): ' + msg(o.reason));
  if (f.status === 'fulfilled') { fdays = f.value.fdays; fc = f.value.fc; } else notes.push('Forecast (Open-Meteo): ' + msg(f.reason));
  if (!obs && !fc) { set({ ...state, status: 'error', error: notes.join(' | '), notes }); return; }

  const levels = [obs && obs.wash, obs && obs.heat, fc && fc.wash, fc && fc.heat].filter(Boolean) as Level[];
  const overall = levels.reduce((a, b) => worst(a, b));
  let trend: string | undefined;
  if (obs && fc) {
    const dlt = rank[fc.wash] - rank[obs.wash];
    trend = dlt > 0 ? 'Rain risk rising: forecast ' + fc.wash + ' (up to ' + fc.rainMax.toFixed(0) + ' mm in a day).'
      : dlt < 0 ? 'Rain risk easing: forecast ' + fc.wash + '.'
      : 'Rain risk steady: forecast ' + fc.wash + '.';
  }
  fetchedAt = Date.now();
  set({ status: 'ok', notes, days, obs, fdays, fc, overall, trend });
}

export function washawayText(): string {
  const w = state;
  if (w.status === 'loading') return 'Loading weather data...';
  if (w.status === 'idle') return 'Not assessed yet';
  if (w.status === 'error') return 'Weather data unavailable';
  const a = w.obs ? w.obs.wash + ' now (' + w.obs.rain7.toFixed(0) + ' mm, 7 days)' : '';
  const b = w.fc ? 'forecast ' + w.fc.wash : '';
  return [a, b].filter(Boolean).join('; ');
}

export function heatText(): string {
  const w = state;
  if (w.status === 'loading') return 'Loading weather data...';
  if (w.status === 'idle') return 'Not assessed yet';
  if (w.status === 'error') return 'Weather data unavailable';
  const a = w.obs ? w.obs.heat + ' now (max ' + w.obs.tmax7.toFixed(0) + ' \u00b0C)' : '';
  const b = w.fc ? 'forecast ' + w.fc.heat + ' (max ' + w.fc.tmax3.toFixed(0) + ' \u00b0C)' : '';
  return [a, b].filter(Boolean).join('; ');
}