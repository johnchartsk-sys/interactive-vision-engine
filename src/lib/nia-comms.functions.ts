import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { DraftSchema, callStatus } from './nia-comms';
import { authorizeOperator, transmit, twilio } from './nia-comms.server';

export const sendCommunication = createServerFn({ method: 'POST' })
  .inputValidator(d => z.object({ draft: DraftSchema, testMode: z.boolean(), confirmed: z.literal(true), token: z.string().max(512), requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    if (data.testMode) return { message: `SIMULATED ${data.draft.kind}: no real call or email was sent.`, recordId: '', status: 'simulated' };
    authorizeOperator(data.token);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    // The unique request ID prevents browser retries from placing duplicate calls.
    const { data: record, error } = await supabaseAdmin.from('nia_communications').insert({ id: data.requestId, kind: data.draft.kind, recipient: data.draft.recipient, subject: data.draft.subject, message: data.draft.message, status: 'sending', confirmed_at: new Date().toISOString() }).select('id').single();
    if (error || !record) throw new Error('This request is already recorded or could not be saved. Check its status before retrying.');
    try {
      const result = await transmit(data.draft);
      await supabaseAdmin.from('nia_communications').update({ status: result.status, provider_id: result.id }).eq('id', record.id);
      return { message: result.message, recordId: record.id, status: result.status };
    } catch (e) {
      await supabaseAdmin.from('nia_communications').update({ status: 'not_confirmed' }).eq('id', record.id);
      throw e;
    }
  });
export const communicationStatus = createServerFn({ method: 'POST' })
  .inputValidator(d => z.object({ recordId: z.string().uuid(), token: z.string().max(512) }).parse(d))
  .handler(async ({ data }) => {
    authorizeOperator(data.token);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: row, error } = await supabaseAdmin.from('nia_communications').select('kind,status,provider_id').eq('id', data.recordId).single();
    if (error || !row) throw new Error('Communication record not found.');
    if (row.kind === 'email') return { message: row.status === 'accepted' ? 'SendGrid accepted the email. Delivery is not confirmed; delivery tracking is not connected.' : `Email status: ${row.status}. Delivery is not confirmed.` };
    if (!row.provider_id || !/^CA[0-9a-f]{32}$/.test(row.provider_id)) return { message: 'Call initiation is not confirmed. Check Twilio before trying again.' };
    const call = await twilio(`/Calls/${row.provider_id}.json`);
    await supabaseAdmin.from('nia_communications').update({ status: call.status }).eq('id', data.recordId);
    return { message: callStatus(call.status) };
  });