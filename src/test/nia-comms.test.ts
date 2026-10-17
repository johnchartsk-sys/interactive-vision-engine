import { describe, expect, it } from 'vitest';
import { ALERT_EMAIL, ALERT_PHONE, CALLER, DraftSchema, SUMMARY_CRON, alertChannels, callStatus, escapeXml } from '@/lib/nia-comms';
describe('NIA communication rules', () => {
  it('supports E.164 international phone numbers and rejects local numbers', () => {
    expect(DraftSchema.safeParse({ kind: 'call', recipient: '+264811234567', message: 'Check pump 12' }).success).toBe(true);
    expect(DraftSchema.safeParse({ kind: 'call', recipient: '0811234567', message: 'Check pump 12' }).success).toBe(false);
  });
  it('requires email recipient, subject and message', () => {
    expect(DraftSchema.safeParse({ kind: 'email', recipient: 'invalid', subject: '', message: '' }).success).toBe(false);
    expect(DraftSchema.safeParse({ kind: 'email', recipient: 'operator@example.com', subject: 'Pump 12', message: 'Review pressure' }).success).toBe(true);
  });
  it('routes verified critical alerts to calls and emails', () => expect(alertChannels('critical', true)).toEqual(['call', 'email']));
  it('routes verified warnings only to email', () => expect(alertChannels('warning', true)).toEqual(['email']));
  it('keeps routine updates in summaries', () => expect(alertChannels('routine', true)).toEqual(['summary']));
  it('never escalates unverified infrastructure alerts', () => expect(alertChannels('critical', false)).toEqual([]));
  it('uses configured caller', () => expect(CALLER).toBe('+17372212163'));
  it('uses configured alert phone', () => expect(ALERT_PHONE).toBe('+264813045639'));
  it('uses configured alert email', () => expect(ALERT_EMAIL).toBe('johnchartsk@gmail.com'));
  it('schedules 18:00 Windhoek at 16:00 UTC', () => expect(SUMMARY_CRON).toBe('0 16 * * *'));
  it('does not claim queued calls were answered', () => expect(callStatus('queued')).toContain('Answering is not confirmed'));
  it('escapes spoken content rather than injecting TwiML', () => expect(escapeXml('<Hangup/> & test')).toBe('&lt;Hangup/&gt; &amp; test'));
});