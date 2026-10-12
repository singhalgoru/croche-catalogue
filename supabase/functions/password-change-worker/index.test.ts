// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
const { rpc, from, send } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), send: vi.fn() }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => ({ rpc, from }) }));
vi.mock('../_shared/passwordChangeEmail.ts', () => ({ sendPasswordChangeEmail: send }));
let handle: (request: Request) => Promise<Response>;
let env: Record<string, string>;
const updates: Record<string, unknown>[] = [];
const job = { id: 'job', recipient: 'buyer@example.test', changed_at: '2026-10-12T04:00:00Z' };
let saveError: { message: string } | null;
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] },
    serve: (handler: typeof handle) => { handle = handler; } });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks(); updates.length = 0; saveError = null;
  env = { CUSTOMER_WELCOME_WORKER_SECRET: 'fixture-worker', RESEND_API_KEY: 'fixture',
    SUPABASE_URL: 'https://example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture' };
  rpc.mockResolvedValue({ data: [job], error: null }); send.mockResolvedValue('provider');
  from.mockImplementation(() => ({ update: (value: Record<string, unknown>) => {
    updates.push(value); return { eq: async () => ({ error: saveError }) };
  } }));
});
const request = (secret = 'fixture-worker', method = 'POST') => new Request('https://example.test/worker', {
  method, headers: { Authorization: `Bearer ${secret}` },
});
it('rejects public requests and unsupported methods before accessing private jobs', async () => {
  expect((await handle(request('wrong'))).status).toBe(401);
  expect((await handle(request('fixture-worker', 'GET'))).status).toBe(405);
  expect(rpc).not.toHaveBeenCalled();
});
it('does not consume jobs when the provider is unconfigured', async () => {
  env.RESEND_API_KEY = '';
  expect((await handle(request())).status).toBe(503);
  expect(rpc).not.toHaveBeenCalled();
});
it('records provider acceptance, not inbox delivery', async () => {
  expect(await (await handle(request())).json()).toEqual({ accepted: 1, failed: 0 });
  expect(send).toHaveBeenCalledWith(job, 'fixture');
  expect(from).toHaveBeenCalledWith('password_change_emails');
  expect(updates[0]).toMatchObject({ provider_id: 'provider', last_error: null });
  expect(updates[0].accepted_at).toBeTruthy();
});
it('keeps failed emails retryable with an explicit failure', async () => {
  send.mockRejectedValue(new Error('Provider unavailable.'));
  const response = await handle(request());
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ accepted: 0, failed: 1 });
  expect(updates).toEqual([{ last_error: 'Provider unavailable.' }]);
});
it('does not claim success when acceptance persistence fails', async () => {
  saveError = { message: 'Database unavailable' };
  const response = await handle(request());
  expect(response.status).toBe(502);
  expect(updates[1]).toMatchObject({ last_error: 'Unable to record password email acceptance: Database unavailable' });
});
it('rejects claim errors and invalid queue responses', async () => {
  rpc.mockResolvedValue({ error: { message: 'Claim denied' } });
  expect((await handle(request())).status).toBe(500);
  expect(send).not.toHaveBeenCalled();
});
