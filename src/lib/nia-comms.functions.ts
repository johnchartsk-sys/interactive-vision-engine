import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { SendCommunicationSchema, callStatus } from './nia-comms';

// Remembers sends in memory, so duplicates are blocked even without the database.
const sentLocally = new Map<string, { kind: string; status: string; providerId: string }>();

// Database logging is optional. If it is not connected, we skip it and carry on.
async function tryDb(fn: (db: any) => Promise<any>): Promise<any> {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    return await fn(supabaseAdmin);
  } catch {
    console.error('Database logging unavailable; continuing without it.');
    return null;
  }
}

export const sendCommunication = createServerFn({ method: 'POST' })
  .inputValidator(d => SendCommunicationSchema.parse(d))
  .handler(async ({ data }) => {
    if (data.testMode) return { message: `SIMULATED ${data.draft.kind}: no real call or email was sent.`, recordId: '', status: 'simulated' };
    const { authorizeOperator, transmit } = await import('./nia-comms.server');
    authorizeOperator(data.token);
    // The unique request ID prevents browser retries from placing duplicate calls.
    if (sentLocally.has(data.requestId)) throw new Error('This request was already sent. Check its status before retrying.');
    const inserted = await tryDb((db) => db.from('nia_communications').insert({ id: data.requestId, kind: data.draft.kind, recipient: data.draft.recipient, subject: data.draft.subject, message: data.draft.message, status: 'sending', confirmed_at: new Date().toISOString() }).select('id').single());
    if (inserted && (inserted.error || !inserted.data)) throw new Error('This request is already recorded or could not be saved. Check its status before retrying.');
    const dbOk = !!inserted;
    sentLocally.set(data.requestId, { kind: data.draft.kind, status: 'sending', providerId: '' });
    try {
      const result = await transmit(data.draft);
      sentLocally.set(data.requestId, { kind: data.draft.kind, status: result.status, providerId: result.id });
      if (dbOk) await tryDb((db) => db.from('nia_communications').update({ status: result.status, provider_id: result.id }).eq('id', data.requestId));
      return { message: result.message, recordId: data.requestId, status: result.status };
    } catch (e) {
      sentLocally.set(data.requestId, { kind: data.draft.kind, status: 'not_confirmed', providerId: '' });
      if (dbOk) await tryDb((db) => db.from('nia_communications').update({ status: 'not_confirmed' }).eq('id', data.requestId));
      throw e;
    }
  });
export const communicationStatus = createServerFn({ method: 'POST' })
  .inputValidator(d => z.object({ recordId: z.string().uuid(), token: z.string().max(512) }).parse(d))
  .handler(async ({ data }) => {
    const { authorizeOperator, twilio } = await import('./nia-comms.server'); authorizeOperator(data.token);
    const local = sentLocally.get(data.recordId);
    let kind = local?.kind;
    let status = local?.status;
    let providerId = local?.providerId;
    if (!local) {
      const res = await tryDb((db) => db.from('nia_communications').select('kind,status,provider_id').eq('id', data.recordId).single());
      if (!res || res.error || !res.data) throw new Error('Communication record not found.');
      kind = res.data.kind; status = res.data.status; providerId = res.data.provider_id;
    }
    if (kind === 'email') return { message: status === 'accepted' ? 'SendGrid accepted the email. Delivery is not confirmed; delivery tracking is not connected.' : `Email status: ${status}. Delivery is not confirmed.` };
    if (!providerId || !/^CA[0-9a-f]{32}$/.test(providerId)) return { message: 'Call initiation is not confirmed. Check Twilio before trying again.' };
    const call = await twilio(`/Calls/${providerId}.json`);
    if (local) sentLocally.set(data.recordId, { ...local, status: call.status });
    await tryDb((db) => db.from('nia_communications').update({ status: call.status }).eq('id', data.recordId));
    return { message: callStatus(call.status) };
  });