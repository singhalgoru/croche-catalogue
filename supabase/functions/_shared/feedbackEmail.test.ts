// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { buildFeedbackEmail, sendFeedbackEmail } from './feedbackEmail';
const job = { id: 'fixture', message: '<script>feedback</script>', category: 'general', contact_name: '', contact_email: '', wants_reply: false };
afterEach(() => vi.unstubAllGlobals());
it('escapes feedback and clearly identifies submissions without a reply email', () => {
  const email = buildFeedbackEmail(job);
  expect(email.html).toContain('&lt;script&gt;feedback&lt;/script&gt;');
  expect(email.html).not.toContain('<script>');
  expect(email.text).toContain('No reply requested');
  expect(email.text).not.toContain('user_id');
});
it.each([false,true])('sends privately to feedback mailbox with consent-based Reply-To: %s', async wantsReply => {
  const send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'provider' })));
  vi.stubGlobal('fetch', send);
  await expect(sendFeedbackEmail({ ...job, wants_reply: wantsReply, contact_email: wantsReply ? 'user@example.test' : '' }, 'fixture')).resolves.toBe('provider');
  const options = send.mock.calls[0][1];
  expect(options.headers['Idempotency-Key']).toBe('feedback-fixture');
  expect(JSON.parse(options.body)).toMatchObject({
    from: 'Luvia Creations <hello@luviacreations.com>', to: ['feedback@luviacreations.com'],
    reply_to: wantsReply ? 'user@example.test' : 'feedback@luviacreations.com',
  });
});
it('reports provider failures explicitly', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));
  await expect(sendFeedbackEmail(job, 'fixture')).rejects.toThrow('HTTP 429');
});
