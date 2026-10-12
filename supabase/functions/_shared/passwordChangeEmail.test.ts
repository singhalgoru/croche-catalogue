// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { buildPasswordChangeEmail, sendPasswordChangeEmail } from './passwordChangeEmail';
const job = { id: 'fixture', recipient: 'buyer@example.test', changed_at: '2026-10-12T04:00:00.000Z' };
afterEach(() => vi.unstubAllGlobals());
it('uses Luvia branding and immediate unauthorized-change instructions in HTML and text', () => {
  const { html, text } = buildPasswordChangeEmail(job);
  for (const content of [html, text]) {
    expect(content).toContain('Your login password has changed');
    expect(content).toContain('reply to this email immediately');
    expect(content).toContain('hello@luviacreations.com');
    expect(content).not.toContain('orders@luviacreations.com');
    expect(content).toContain('Forgot password');
    expect(content).toContain('2026-10-12 04:00:00 UTC');
    expect(content).toContain('never ask you to share your password');
  }
  expect(html).toContain('https://luviacreations.com/images/luvia-logo.jpg');
  for (const color of ['#fff9ef', '#604439', '#d4ab58']) expect(html).toContain(color);
  expect(html).not.toContain('ConfirmationURL');
});
it('escapes recipient content and rejects invalid timestamps', () => {
  expect(buildPasswordChangeEmail({ ...job, recipient: '<script>&"' }).html).toContain('&lt;script&gt;&amp;&quot;');
  expect(() => buildPasswordChangeEmail({ ...job, changed_at: 'invalid' })).toThrow('Invalid password change timestamp');
});
it('sets a monitored reply address and stable event-specific provider idempotency', async () => {
  const send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'provider' })));
  vi.stubGlobal('fetch', send);
  await expect(sendPasswordChangeEmail(job, 'fixture-key')).resolves.toBe('provider');
  const options = send.mock.calls[0][1];
  expect(options.headers['Idempotency-Key']).toBe('password-change-fixture');
  expect(JSON.parse(options.body)).toMatchObject({ from: 'Luvia Creations <hello@luviacreations.com>',
    to: ['buyer@example.test'], reply_to: 'hello@luviacreations.com',
    subject: 'Your login password has changed - Luvia Creations' });
});
it('surfaces provider rejection and invalid acceptance instead of claiming success', async () => {
  const send = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }));
  vi.stubGlobal('fetch', send);
  await expect(sendPasswordChangeEmail(job, 'fixture')).rejects.toThrow('HTTP 429');
  send.mockResolvedValue(new Response('{}'));
  await expect(sendPasswordChangeEmail(job, 'fixture')).rejects.toThrow('Invalid password notification provider confirmation');
});
