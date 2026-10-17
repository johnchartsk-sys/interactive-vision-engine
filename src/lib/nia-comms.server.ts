import { timingSafeEqual, createHash } from 'node:crypto';
import { CALLER, callStatus, escapeXml, type CommunicationDraft } from './nia-comms';

export function authorizeOperator(token: string) {
  const expected = process.env['NIA_OPERATOR_TOKEN'];
  if (!expected) throw new Error('Real sending is locked. Configure operator authorization first.');
  const hash = (s: string) => createHash('sha256').update(s).digest();
  if (!timingSafeEqual(hash(token), hash(expected))) throw new Error('Operator authorization was not accepted.');
}
export async function twilio(path: string, body?: URLSearchParams) {
  const key = process.env['TWILIO_API_KEY'];
  const lovable = process.env['LOVABLE_API_KEY'];
  if (!key || !lovable) throw new Error('Twilio connection is not configured.');
  const res = await fetch(`https://connector-gateway.lovable.dev/twilio${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${lovable}`, 'X-Connection-Api-Key': key, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body,
  });
  if (!res.ok) {
    // Do not log provider bodies: they may echo private recipients or credentials.
    console.error('Twilio request failed', res.status);
    throw new Error(`Twilio rejected the request (${res.status}); check account permissions and calling regions.`);
  }
  return res.json();
}
export async function transmit(draft: CommunicationDraft): Promise<{ id: string; status: string; message: string }> {
  if (draft.kind === 'call') {
    const numbers = await twilio(`/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(CALLER)}`);
    if (!numbers.incoming_phone_numbers?.some((n: { phone_number: string; capabilities?: { voice?: boolean } }) => n.phone_number === CALLER && n.capabilities?.voice)) throw new Error('Your caller number is not voice-enabled on the connected Twilio account. No call was placed.');
    const call = await twilio('/Calls.json', new URLSearchParams({ To: draft.recipient, From: CALLER, Twiml: `<Response><Say>${escapeXml(`This is NIA from NamTwin Go. ${draft.message}`)}</Say></Response>`, Timeout: '30', TimeLimit: '120' }));
    return { id: call.sid, status: call.status, message: `Call initiated. ${callStatus(call.status)}` };
  }
  const key = process.env['SENDGRID_API_KEY'];
  const from = process.env['SENDGRID_FROM_EMAIL'];
  if (!key || !from) throw new Error('Email sending is locked until a SendGrid key and verified sender are configured.');
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ personalizations: [{ to: [{ email: draft.recipient }] }], from: { email: from, name: 'NIA · NamTwin-Go' }, subject: draft.subject, content: [{ type: 'text/plain', value: draft.message }] }) });
  if (res.status !== 202) { console.error('SendGrid request failed', res.status); throw new Error(`SendGrid rejected the email (${res.status}). Check the sender verification and Mail Send permission.`); }
  return { id: res.headers.get('x-message-id') ?? '', status: 'accepted', message: 'SendGrid accepted the email for processing. Delivery is not confirmed.' };
}