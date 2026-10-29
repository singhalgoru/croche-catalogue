// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
const { rpc, user, update, single, fetchMock } = vi.hoisted(() => ({
  rpc: vi.fn(), user: vi.fn(), update: vi.fn(), single: vi.fn(), fetchMock: vi.fn(),
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({ rpc, auth: { getUser: user }, from: () => ({ update }) }),
}));
let handle: (request: Request) => Promise<Response>;
let configured = true;
const token = 'a'.repeat(64);
const input = { id: '00000000-0000-4000-8000-000000000001', token, name: '<Maker>', channel: 'email', contact: 'maker@example.test' };
beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => name === 'RESEND_API_KEY' && !configured ? undefined : 'fixture' },
    serve: (handler: typeof handle) => { handle = handler; },
  });
  vi.stubGlobal('fetch', fetchMock); await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks(); configured = true;
  user.mockResolvedValue({ data: { user: { id: 'admin', email_confirmed_at: '2026-01-01', is_anonymous: false } } });
  rpc.mockImplementation(async name => ({ data: name === 'is_catalogue_admin' ? true : {
    id: input.id, recipient_name: '<Maker>', contact: input.contact, expires_at: '2026-11-05T00:00:00Z', provider_id: null,
  } }));
  single.mockResolvedValue({ data: { id: input.id } });
  update.mockReturnValue({ eq: () => ({ select: () => ({ single }) }) });
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'provider-id' }), { status: 200 }));
});
const request = (body: unknown, auth = true) => new Request('https://example.test/invite', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer fixture' } : {}) },
  body: JSON.stringify(body),
});
it('requires a verified account and fresh admin MFA before saving or sending', async () => {
  expect((await handle(request(input, false))).status).toBe(401);
  rpc.mockResolvedValue({ data: false });
  expect((await handle(request(input))).status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('sends from onboarding with escaped content and a stable provider idempotency key', async () => {
  const response = await handle(request(input));
  expect(response.status).toBe(200);
  const receipt = await response.json();
  expect(receipt.link).toBe(`https://luviacreations.com/artisans/#invite=${token}`);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails');
  expect(options.headers['Idempotency-Key']).toBe(`artisan-invite-${input.id}`);
  const body = JSON.parse(options.body);
  expect(body.from).toBe('Luvia Creations <onboarding@luviacreations.com>');
  expect(body.to).toEqual(['maker@example.test']);
  expect(body.reply_to).toBe('hello@luviacreations.com');
  expect(body.html).toContain('&lt;Maker&gt;'); expect(body.html).not.toContain('Hello <Maker>');
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ provider_id: 'provider-id' }));
});
it('creates WhatsApp invitations without contacting the email provider', async () => {
  const response = await handle(request({ ...input, channel: 'whatsapp', contact: '9876543210' }));
  expect(response.status).toBe(200);
  expect((await response.json()).message).toContain('Nothing has been sent automatically');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('does not save or send an email invitation when the provider is not configured', async () => {
  configured = false; expect((await handle(request(input))).status).toBe(503);
  expect(rpc).toHaveBeenCalledTimes(1); expect(fetchMock).not.toHaveBeenCalled();
});
it('rejects invalid destinations and never sends after a database refusal', async () => {
  expect((await handle(request({ ...input, contact: 'invalid' }))).status).toBe(400);
  rpc.mockImplementation(async name => name === 'is_catalogue_admin' ? { data: true } : { error: { message: 'Daily limit' } });
  expect((await handle(request(input))).status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
});
it('does not resend an already provider-accepted email', async () => {
  rpc.mockImplementation(async name => ({ data: name === 'is_catalogue_admin' ? true : { provider_id: 'existing' } }));
  expect((await handle(request(input))).status).toBe(200); expect(fetchMock).not.toHaveBeenCalled();
});
it('reports ambiguous provider acceptance persistence instead of claiming confirmed success', async () => {
  single.mockResolvedValue({ error: { message: 'Database unavailable' } });
  const response = await handle(request(input));
  expect(response.status).toBe(502);
  expect((await response.json()).error).toContain('Retry this same invitation');
});
it('surfaces provider refusal without marking email accepted', async () => {
  fetchMock.mockResolvedValue(new Response('{}', { status: 403 }));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await handle(request(input));
  expect(response.status).toBe(502); expect(update).not.toHaveBeenCalled();
  expect((await response.json()).error).toContain('HTTP 403'); log.mockRestore();
});
