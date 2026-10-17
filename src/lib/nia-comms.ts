import { z } from 'zod';

export const CALLER = '+17372212163';
export const ALERT_PHONE = '+2643045639';
export const ALERT_EMAIL = 'johnchartsk@gmail.com';
export const SUMMARY_CRON = '0 16 * * *';
export const DraftSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('call'), recipient: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use an international number, for example +264811234567'), subject: z.string().max(200).default(''), message: z.string().trim().min(1).max(3000) }),
  z.object({ kind: z.literal('email'), recipient: z.string().email(), subject: z.string().trim().min(1).max(200), message: z.string().trim().min(1).max(10000) }),
]);
export type CommunicationDraft = z.infer<typeof DraftSchema>;
export function alertChannels(severity: 'critical' | 'warning' | 'routine', verified: boolean): ('call' | 'email' | 'summary')[] {
  if (!verified) return [];
  return severity === 'critical' ? ['call', 'email'] : severity === 'warning' ? ['email'] : ['summary'];
}
export function callStatus(status: string) {
  if (status === 'in-progress') return 'Twilio reports the call connected; the intended person is not verified.';
  if (status === 'completed') return 'Twilio reports the call completed; the intended person is not verified.';
  return `Twilio call status: ${status}. Answering is not confirmed.`;
}
export function escapeXml(text: string) {
  return text.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] ?? c));
}