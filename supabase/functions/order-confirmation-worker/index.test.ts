// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
const { rpc, from, send } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), send: vi.fn() }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => ({ rpc, from }) }));
vi.mock('../_shared/orderEmail.ts', () => ({ sendOrderEmail: send }));
let handle: (request: Request) => Promise<Response>;
let env: Record<string, string>;
const updates: Record<string, unknown>[] = [];
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] },
    serve: (handler: typeof handle) => { handle = handler; } });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks(); updates.length = 0;
  env = { CUSTOMER_WELCOME_WORKER_SECRET: 'worker-fixture', RESEND_API_KEY: 'fixture',
    WELCOME_COUPON_FROM_EMAIL: 'sender@example.test', SUPABASE_URL: 'https://example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture' };
  rpc.mockResolvedValue({ data: [{ id: 'job-id', order_id: 'order-id', audience: 'store', recipient: 'orders@luviacreations.com' }], error: null });
  send.mockResolvedValue('provider-id');
  from.mockImplementation(() => {
    const query = { select: () => query, eq: () => query,
      update: (value: Record<string, unknown>) => { updates.push(value); return query; },
      single: async () => ({ data: { status: 'paid' }, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
    return query;
  });
});
const request = (secret = 'worker-fixture') => new Request('https://example.test/worker', {
  method: 'POST', headers: { Authorization: `Bearer ${secret}` },
});
it('rejects callers without the worker secret before claiming messages', async () => {
  expect((await handle(request('wrong'))).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
it('records accepted emails separately from payment settlement', async () => {
  const response = await handle(request());
  expect(await response.json()).toEqual({ accepted: 1, failed: 0 });
  expect(updates[0]).toMatchObject({ provider_id: 'provider-id', last_error: null });
  expect(updates[0].accepted_at).toBeTruthy();
});
it('leaves provider failures retryable and records the failure', async () => {
  send.mockRejectedValue(new Error('Provider rejected email.'));
  const response = await handle(request());
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ accepted: 0, failed: 1 });
  expect(updates).toEqual([{ last_error: 'Provider rejected email.' }]);
});
it('does not consume queued jobs when provider configuration is missing', async () => {
  env.RESEND_API_KEY = '';
  expect((await handle(request())).status).toBe(503);
  expect(rpc).not.toHaveBeenCalled();
});
