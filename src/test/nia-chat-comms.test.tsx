import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ ask: vi.fn(), send: vi.fn() }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@/lib/nia.functions', () => ({ askNia: mocks.ask }));
vi.mock('@/lib/nia-comms.functions', () => ({ sendCommunication: mocks.send }));
import { NiaChat } from '@/components/NiaChat';

const callDraft = { kind: 'call', recipient: '+264811234567', subject: '', message: 'Please check pump 12.' };
function openChat() { render(<NiaChat dashboard="Demo" onClose={() => {}} onRecommendation={() => {}} />); }
async function requestDraft() {
  fireEvent.change(screen.getByLabelText('Message NIA'), { target: { value: 'Call +264811234567 to check pump 12.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
  await screen.findByRole('region', { name: 'Communication confirmation' });
}
describe('NIA chat communications', () => {
  beforeEach(() => {
    vi.clearAllMocks(); window.localStorage.clear();
    mocks.ask.mockResolvedValue({ reply: 'Draft ready.', draft: callDraft });
    mocks.send.mockResolvedValue({ message: 'SIMULATED call: no real call or email was sent.', status: 'simulated' });
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it('defaults to test mode and never sends a generated draft without confirmation', async () => {
    openChat(); await requestDraft();
    expect(screen.getByLabelText('Test mode')).toBeChecked();
    expect(mocks.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm simulation' }));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
    expect(mocks.send).toHaveBeenCalledWith({ data: { draft: callDraft, testMode: true, confirmed: true, token: '', requestId: '11111111-1111-4111-8111-111111111111' } });
  });
  it('cancels an email without sending', async () => {
    mocks.ask.mockResolvedValue({ reply: 'Draft ready.', draft: { kind: 'email', recipient: 'operator@example.com', subject: 'Pump 12', message: 'Review pressure.' } });
    openChat(); await requestDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(mocks.send).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Communication confirmation' })).not.toBeInTheDocument();
  });
  it('only disables test mode through the explicit toggle and remembers that choice', () => {
    openChat();
    expect(screen.getByLabelText('Test mode')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Test mode'));
    expect(screen.getByLabelText('Test mode')).not.toBeChecked();
    cleanup(); openChat();
    expect(screen.getByLabelText('Test mode')).not.toBeChecked();
  });
  it('requires operator authorization as well as confirmation for real sending', async () => {
    openChat(); fireEvent.click(screen.getByLabelText('Test mode')); await requestDraft();
    expect(screen.getByRole('button', { name: 'Confirm real call' })).toBeDisabled();
    expect(mocks.send).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Operator passcode'), { target: { value: 'test-only' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm real call' }));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
    expect(mocks.send.mock.calls[0][0].data.testMode).toBe(false);
    expect(mocks.send.mock.calls[0][0].data.confirmed).toBe(true);
  });
});