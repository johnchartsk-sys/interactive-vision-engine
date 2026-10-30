// @ts-nocheck
import { useEffect, useState } from 'react';
import { selectAsset, useSelectedAsset } from '@/lib/assetBus';
import { runMapCommand } from '@/lib/mapBus';
import { telemetry, condition, maintenance, createWorkOrder, trainContext, trackCondition } from '@/lib/assetData';

const SIM = { text: 'SIMULATED', color: '#fbbf24' };
const REAL = { text: 'REAL \u00b7 OpenStreetMap', color: '#34d399' };

function Skeleton() {
  return (
    <div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ height: 13, margin: '8px 0', borderRadius: 4, background: 'rgba(255,255,255,0.14)', width: (55 + ((i * 11) % 40)) + '%', animation: 'niaPulse 1s ease-in-out infinite' }} />
      ))}
    </div>
  );
}

function Section({ title, tag, loading, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, borderBottom: '1px solid rgba(34,211,238,0.35)', paddingBottom: 4 }}>
        <span style={{ fontSize: 11, letterSpacing: 1, fontWeight: 700 }}>{title}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: tag.color }}>{'\u25cf'} {tag.text}</span>
      </div>
      {loading ? <Skeleton /> : children}
    </div>
  );
}

function Line({ k, v, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: 12 }}>
      <span style={{ opacity: 0.7 }}>{k}</span>
      <span style={{ textAlign: 'right', color: color || '#e6faff' }}>{v}</span>
    </div>
  );
}

const btn = { flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #22d3ee', background: 'rgba(34,211,238,0.12)', color: '#e6faff', cursor: 'pointer', fontSize: 12 };

export function AssetPanel() {
  const asset = useSelectedAsset();
  const [, tick] = useState(0);
  const [loading, setLoading] = useState(false);
  const id = asset ? asset.id : null;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(t);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const key = (e) => { if (e.key === 'Escape') selectAsset(null); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [id]);

  if (!asset) return null;
  const isTrain = asset.kind === 'train';
  const tel = isTrain ? telemetry(asset.id) : null;
  const cond = isTrain ? condition(asset.id) : null;
  const live = asset.live ? asset.live() : [];
  const wos = maintenance(asset.id, asset.kind);
  const badge = asset.simulated ? SIM : REAL;
  const scoreColor = cond ? (cond.score >= 85 ? '#34d399' : cond.score >= 60 ? '#fbbf24' : '#f87171') : '#34d399';
  const axleColor = tel ? (tel.axle > 90 ? '#f87171' : tel.axle > 70 ? '#fbbf24' : '#34d399') : undefined;

  return (
    <aside
      aria-label={asset.name}
      style={{ position: 'fixed', top: 90, left: 24, width: 360, maxHeight: '80vh', overflowY: 'auto', zIndex: 60, padding: 16, borderRadius: 12, color: '#e6faff', background: 'rgba(4, 22, 36, 0.97)', border: '1px solid #22d3ee', boxShadow: '0 0 24px rgba(34, 211, 238, 0.35)' }}
    >
      <style>{'@keyframes niaPulse{0%,100%{opacity:.35}50%{opacity:.9}}'}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ letterSpacing: 1, fontSize: 14 }}>{asset.name}</strong>
        <button onClick={() => selectAsset(null)} aria-label="Close" style={{ background: 'none', border: 'none', color: '#e6faff', fontSize: 20, cursor: 'pointer' }}>{'\u00d7'}</button>
      </div>
      <div style={{ fontSize: 11, marginTop: 2 }}>
        <span style={{ opacity: 0.7 }}>{asset.id}</span>
        <span style={{ marginLeft: 10, fontWeight: 700, color: badge.color }}>{'\u25cf'} {badge.text}</span>
      </div>

      {isTrain && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={() => runMapCommand({ action: 'follow_train', place: String(asset.trainNo || 1) })} style={btn}>Follow</button>
          <button onClick={() => runMapCommand({ action: 'stop_following' })} style={{ ...btn, border: '1px solid rgba(255,255,255,0.3)', background: 'none' }}>Stop following</button>
        </div>
      )}

      <Section title="LIVE TELEMETRY" tag={SIM} loading={loading}>
        {isTrain ? (
          <div>
            <Line k="Speed" v={tel.speed.toFixed(0) + ' km/h'} />
            <Line k="Axle bearing temperature" v={tel.axle.toFixed(0) + ' \u00b0C'} color={axleColor} />
            <Line k="Brake pipe pressure" v={tel.brake.toFixed(0) + ' kPa'} />
            <Line k="Fuel level" v={tel.fuel.toFixed(1) + ' %'} />
            <Line k="Dynamic braking" v={tel.dynBrake ? 'Active' : 'Off'} />
            {live.map(([k, v]) => <Line key={k} k={k} v={v} />)}
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>Values are simulated. Map movement is sped up for visibility.</div>
          </div>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.8 }}>No live sensor is connected to this track segment. Weather-based rail stress comes with the NASA layer.</div>
        )}
      </Section>

      <Section title="CONDITION" tag={SIM} loading={loading}>
        {isTrain ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: scoreColor }}>{cond.score}%</span>
              <span style={{ color: scoreColor, fontWeight: 700 }}>{cond.label}</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.12)', margin: '6px 0 8px' }}>
              <div style={{ width: cond.score + '%', height: '100%', borderRadius: 4, background: scoreColor }} />
            </div>
            <Line k="Wheelset remaining life" v={cond.rulWheel + ' days'} />
            <Line k="Traction motor remaining life" v={cond.rulMotor + ' days'} />
            {cond.anomalies.length === 0
              ? <Line k="Active anomalies" v="None" color="#34d399" />
              : cond.anomalies.map(([k, v]) => <Line key={k} k={'\u26a0 ' + k} v={v} color="#f87171" />)}
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>{cond.factors}</div>
          </div>
        ) : (
          <div>{trackCondition(asset.id).map(([k, v]) => <Line key={k} k={k} v={v} />)}</div>
        )}
      </Section>

      <Section title="MAINTENANCE" tag={SIM} loading={loading}>
        <div>
          {wos.map((w) => (
            <div key={w.id} style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{w.title}</span><span style={{ opacity: 0.6 }}>{w.id}</span></div>
              <div style={{ opacity: 0.7, fontSize: 11, color: w.status.startsWith('Completed') ? undefined : '#fbbf24' }}>{w.status} {'\u00b7'} {w.when}</div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => { createWorkOrder(asset.id, 'Work order for ' + asset.id); tick((n) => n + 1); }} style={btn}>Create Work Order</button>
            <button onClick={() => { createWorkOrder(asset.id, 'Depot inspection flagged for ' + asset.id); tick((n) => n + 1); }} style={btn}>Flag for inspection</button>
          </div>
        </div>
      </Section>

      <Section title="ASSET CONTEXT" tag={isTrain ? SIM : REAL} loading={loading}>
        <div>
          {asset.props.map(([k, v]) => <Line key={k} k={k} v={v} />)}
          {isTrain && trainContext(asset.id).map(([k, v]) => <Line key={k} k={k} v={v} />)}
        </div>
      </Section>

      <div style={{ marginTop: 12, fontSize: 10, opacity: 0.6 }}>Everything on this panel is simulated unless tagged REAL. No TransNamib systems are connected.</div>
    </aside>
  );
}