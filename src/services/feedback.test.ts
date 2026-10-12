import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { submitFeedback } from './feedback';
const { session, anonymous, rpc, captcha } = vi.hoisted(() => ({
  session: vi.fn(), anonymous: vi.fn(), rpc: vi.fn(), captcha: vi.fn(),
}));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({
  auth: { getSession: session, signInAnonymously: anonymous }, rpc,
}) }));
vi.mock('./cartCaptcha', () => ({ requestCartCaptcha: captcha }));
const input = { requestId: 'request', message: 'Please add more colour options.', category: 'suggestion' as const,
  name: '', email: '', wantsReply: false };
beforeEach(() => {
  vi.clearAllMocks(); session.mockResolvedValue({ data: { session: {} } });
  rpc.mockImplementation(async name => ({ data: name === 'submit_store_feedback' ? 'request' : 'sent' }));
  anonymous.mockResolvedValue({ error: null }); captcha.mockResolvedValue('captcha');
});
afterEach(() => vi.useRealTimers());
it('submits feedback without attaching account contact details or unrequested email', async () => {
  await submitFeedback({ ...input, email: 'do-not-send@example.test' });
  expect(rpc).toHaveBeenCalledWith('submit_store_feedback', expect.objectContaining({ contact_email: '', wants_reply: false }));
  expect(anonymous).not.toHaveBeenCalled();
});
it('creates a CAPTCHA-protected guest session only when needed', async () => {
  session.mockResolvedValue({ data: { session: null } });
  await submitFeedback(input);
  expect(anonymous).toHaveBeenCalledWith({ options: { captchaToken: 'captcha' } });
});
it('requires email only when a reply is requested and validates message lengths', async () => {
  await expect(submitFeedback({ ...input, wantsReply: true })).rejects.toThrow('valid email');
  await expect(submitFeedback({ ...input, message: 'short' })).rejects.toThrow('10 and 3,000');
  expect(rpc).not.toHaveBeenCalled();
});
it('surfaces database/rate-limit errors and invalid receipts', async () => {
  rpc.mockResolvedValue({ error: { message: 'Submission limit reached' } });
  await expect(submitFeedback(input)).rejects.toThrow('Submission limit reached');
  rpc.mockResolvedValue({ data: 'different' });
  await expect(submitFeedback(input)).rejects.toThrow('Invalid feedback receipt');
});
it('waits for provider acceptance rather than treating persistence as sending', async () => {
  vi.useFakeTimers();
  rpc.mockResolvedValueOnce({ data: 'request' }).mockResolvedValueOnce({ data: 'pending' }).mockResolvedValueOnce({ data: 'sent' });
  const submission = submitFeedback(input);
  await vi.advanceTimersByTimeAsync(1000);
  await submission;
  expect(rpc).toHaveBeenLastCalledWith('store_feedback_delivery_status', { request_id: 'request' });
  expect(rpc).toHaveBeenCalledTimes(3);
});
it.each([
  [{ data: 'failed' }, 'could not be sent yet'],
  [{ error: { message: 'Connection interrupted' } }, 'could not confirm email delivery'],
  [{ data: null }, 'Invalid feedback delivery confirmation'],
])('does not report sending when confirmation is unavailable: %j', async (result, message) => {
  rpc.mockResolvedValueOnce({ data: 'request' }).mockResolvedValue(result);
  await expect(submitFeedback(input)).rejects.toThrow(message);
});
it('bounds waiting and preserves a saved receipt for an unchanged retry', async () => {
  vi.useFakeTimers();
  rpc.mockResolvedValueOnce({ data: 'request' }).mockResolvedValue({ data: 'pending' });
  const submission = expect(submitFeedback(input)).rejects.toThrow('sending has not been confirmed yet');
  await vi.advanceTimersByTimeAsync(19000);
  await submission;
  expect(rpc).toHaveBeenCalledTimes(21);
});
