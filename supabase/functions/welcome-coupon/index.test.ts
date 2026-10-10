// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
const { getUser, rpc, update, fetchMock } = vi.hoisted(() => ({
  getUser: vi.fn(), rpc: vi.fn(), update: vi.fn(), fetchMock: vi.fn(),
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({ auth: { getUser }, rpc, from: () => ({ update: (values: unknown) => {
    update(values); return { eq: async () => ({ error: null }) };
  } }) }),
}));
let handler: (request: Request) => Promise<Response>;
const env: Record<string, string> = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'fixture',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture', RESEND_API_KEY: 'fixture', WELCOME_COUPON_FROM_EMAIL: 'welcome@example.test',
};
const coupon = { id: 'coupon', user_id: 'owner', email: 'buyer@example.test', code: 'WELCOME-TEST',
  percent: 10, max_discount_rupees: 100, minimum_subtotal_rupees: 500, expires_at: '2027-01-01T00:00:00Z',
  email_sent_at: null };
const request = (auth = true) => new Request('https://example.test/welcome-coupon', {
  method: 'POST', headers: auth ? { Authorization: 'Bearer fixture' } : {}, body: JSON.stringify({ owner_id: 'attacker' }),
});
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] }, serve: (callback: typeof handler) => { handler = callback; } });
  vi.stubGlobal('fetch', fetchMock);
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  env.RESEND_API_KEY = 'fixture';
  getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  rpc.mockResolvedValue({ data: coupon, error: null });
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'email_fixture' }), { status: 200 }));
});
it('uses the authenticated user and coupon email, never recipient details from the browser', async () => {
  const response = await handler(request());
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('claim_welcome_coupon', { owner_id: 'owner' });
  const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(payload.to).toEqual(['buyer@example.test']);
  expect(payload.text).toContain('WELCOME-TEST');
  expect(payload.text).toContain('₹500');
  expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe('welcome-coupon-coupon');
  expect(update).toHaveBeenCalledWith({ email_sent_at: expect.any(String) });
});
it('does not resend an already accepted coupon email', async () => {
  rpc.mockResolvedValue({ data: { ...coupon, email_sent_at: '2026-10-10T00:00:00Z' }, error: null });
  expect((await handler(request())).status).toBe(200);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('requires provider configuration, authentication and eligible verified email', async () => {
  env.RESEND_API_KEY = '';
  expect((await handler(request())).status).toBe(503);
  env.RESEND_API_KEY = 'fixture';
  expect((await handler(request(false))).status).toBe(401);
  rpc.mockResolvedValue({ data: null, error: { message: 'Verify your email first.' } });
  expect((await handler(request())).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('reports provider failure and leaves the coupon retryable', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
  expect((await handler(request())).status).toBe(502);
  expect(update).not.toHaveBeenCalled();
  fetchMock.mockRejectedValue(new Error('Timed out'));
  expect((await handler(request())).status).toBe(502);
  log.mockRestore();
});
