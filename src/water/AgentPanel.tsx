// @ts-nocheck
import { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { Panel } from './panels';
import { ALERT_EMAIL, ALERT_PHONE } from '@/lib/nia-comms';
import { acknowledge, armReal, closePopup, disarm, escalationInfo, restorePower, setSetting, simulatePowerDip, useAgent } from './agent';

const SEV = { critical: '#f87171', warning: '#fbbf24', info: '#22d3ee' };
const cx = (...c) => c.filter(Boolean).join(' ');

function useNow() {
  const [n, setN] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return n;
}

function Toggle({ checked, onChange, label, sub }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-1 text-[11px] text-slate-200">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}{sub && <span className="block text-[10px] text-slate-500">{sub}</span>}</span>
    </label>
  );
}

function Field({ k, v, c }) {
  return (
    <div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">{k}: </span>
      <span style={{ color: c || '#e2e8f0' }}>{v}</span>
    </div>
  );
}

const btn = 'flex-1 rounded border px-2 py-1 text-[11px]';

export function NiaWatchPanel({ onSelect }) {
  const ag = useAgent();
  const now = useNow();
  const st = ag.settings;
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState('');
  const open = ag.incidents.filter((i) => i.status === 'open').length;
  const mask = ALERT_PHONE.slice(0, 4) + '...' + ALERT_PHONE.slice(-3);

  return (
    <Panel
      title="NIA Watch" icon={<Radio size={13} />}
      right={<span className={cx('rounded-full border px-2 py-0.5 text-[10px]', open ? 'border-red-500/50 bg-red-500/15 text-red-300' : 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300')}>{open ? open + ' need attention' : 'monitoring'}</span>}
    >
      <p className="mb-2 text-[11px] leading-snug text-slate-400">
        Watches pressure, flow, reservoirs and pumps without being asked. A critical incident opens a briefing, speaks it aloud, and escalates by email and then a call if nobody acknowledges. Works only while this page is open.
      </p>
      <div className="mb-2 flex gap-2">
        <button className={cx(btn, 'border-amber-500/60 bg-amber-500/10 text-amber-300')} onClick={() => simulatePowerDip()}>Simulate substation power dip</button>
        <button className={cx(btn, 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300')} onClick={() => restorePower()}>Restore power (restart PS-1)</button>
      </div>
      <Toggle checked={st.demoTiming} onChange={(v) => setSetting('demoTiming', v)} label="Demo timing" sub="Email after 20 s, call after 40 s. Off = real timing: 5 min and 10 min." />
      <Toggle checked={st.testMode} onChange={(v) => setSetting('testMode', v)} label="Test mode (simulated email and call)" sub="Recommended. Nothing real is sent." />
      <Toggle checked={st.voice} onChange={(v) => setSetting('voice', v)} label="Speak alerts aloud" />
      {!st.testMode && (
        <div className="mt-1 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          {st.armed ? (
            <div>
              REAL sending is ARMED. Unacknowledged critical incidents will really email and call. Sent this session: {st.sentReal} of 3.
              <button className="ml-2 rounded border border-current px-1.5" onClick={() => disarm()}>Disarm</button>
            </div>
          ) : (
            <div>
              Type the operator passcode to arm real email and calls.
              <div className="mt-1 flex gap-1">
                <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} className="flex-1 rounded border border-amber-500/40 bg-slate-900 px-1 text-slate-100" aria-label="Operator passcode" />
                <button className="rounded border border-current px-2" onClick={() => { setMsg(armReal(pass) ? '' : 'Enter the passcode first.'); setPass(''); }}>Arm</button>
              </div>
              {msg && <div className="mt-1 text-red-300">{msg}</div>}
            </div>
          )}
        </div>
      )}
      <div className="mt-1 text-[10px] text-slate-500">Alerts go to {ALERT_EMAIL} and {mask}. Maximum 3 real messages per session.</div>

      <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {ag.incidents.length === 0 && <div className="py-2 text-center text-xs text-slate-500">No incidents. NIA Watch is monitoring.</div>}
        {ag.incidents.map((i) => (
          <div
            key={i.id} className="cursor-pointer rounded-lg border p-2 text-xs"
            style={{ borderColor: i.status === 'resolved' ? '#334155' : SEV[i.severity] + '88', opacity: i.status === 'resolved' ? 0.55 : 1 }}
            onClick={() => onSelect(i.assetId)}
          >
            <div className="flex justify-between gap-2">
              <span className="font-semibold" style={{ color: SEV[i.severity] }}>{i.severity.toUpperCase()} {'\u00b7'} {i.assetId}</span>
              <span className="text-[10px] text-slate-400">{i.status}</span>
            </div>
            <div className="text-slate-100">{i.title}</div>
            <div className="text-[10px] text-slate-400">{i.urgency}</div>
            {i.severity === 'critical' && i.status !== 'resolved' && <div className="mt-0.5 text-[10px] text-amber-300">{escalationInfo(i, now)}</div>}
            {i.status === 'open' && (
              <button className="mt-1 rounded border border-current px-1.5 py-0.5 text-[10px]" onClick={(e) => { e.stopPropagation(); acknowledge(i.id); }}>Acknowledge</button>
            )}
          </div>
        ))}
      </div>
      {ag.events.length > 0 && (
        <div className="mt-2 space-y-0.5 border-t border-slate-700/60 pt-1 font-mono text-[10px] text-slate-500">
          {ag.events.slice(0, 4).map((e, k) => <div key={k}>{e.time} {e.text}</div>)}
        </div>
      )}
    </Panel>
  );
}

export function IncidentPopup({ onSelect }) {
  const ag = useAgent();
  useNow();
  const inc = ag.incidents.find((i) => i.id === ag.popupId);
  if (!inc) return null;
  const now = Date.now();
  return (
    <div role="alertdialog" aria-label="Critical incident" className="fixed inset-x-0 top-3 z-[300] mx-auto w-[min(680px,94vw)] overflow-hidden rounded-xl border-2 border-red-500 bg-slate-950 shadow-2xl shadow-red-900/60">
      <div className="flex items-center justify-between bg-red-600 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white">
        <span className="animate-pulse">{'\u26a0'} {inc.severity === 'critical' ? 'Critical incident' : 'Incident'} {'\u00b7'} NIA Watch</span>
        <span className="font-mono text-[10px] opacity-90">{inc.id} {'\u00b7'} {inc.clock}</span>
      </div>
      <div className="space-y-2 p-3 text-xs">
        <div className="text-base font-semibold text-slate-100">{inc.title}</div>
        <Field k="Where" v={inc.where} />
        <Field k="Impact" v={inc.impact} />
        <Field k="How urgent" v={inc.urgency} c="#f87171" />
        {inc.cause && <Field k="Likely cause" v={inc.cause} />}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Recommended (what-if analysis, advice only)</div>
          <ol className="list-decimal space-y-1 pl-4 text-slate-200">{inc.advice.map((a, k) => <li key={k}>{a}</li>)}</ol>
        </div>
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-amber-200">{escalationInfo(inc, now) || 'No escalation for this severity.'}</div>
        {inc.log.length > 0 && <div className="max-h-20 overflow-y-auto font-mono text-[10px] text-slate-400">{inc.log.map((l, k) => <div key={k}>{l}</div>)}</div>}
        <div className="text-[10px] text-slate-500">SIMULATED network. Detection by rules, not a trained model.</div>
        <div className="flex flex-wrap gap-2 pt-1">
          {inc.status === 'open' && <button className="rounded border border-emerald-400 bg-emerald-500/20 px-3 py-1 font-semibold text-emerald-200" onClick={() => acknowledge(inc.id)}>Acknowledge</button>}
          <button className="rounded border border-cyan-400 bg-cyan-500/15 px-3 py-1 text-cyan-200" onClick={() => { onSelect(inc.assetId); closePopup(); }}>Show on map</button>
          <button className="rounded border border-slate-500 px-3 py-1 text-slate-300" onClick={() => closePopup()}>Close</button>
        </div>
      </div>
    </div>
  );
}