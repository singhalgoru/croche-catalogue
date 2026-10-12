// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
const { rpc, from, send } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), send: vi.fn() }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => ({ rpc, from }) }));
vi.mock('../_shared/feedbackEmail.ts', () => ({ sendFeedbackEmail: send }));
let handle: (request: Request) => Promise<Response>;
let env: Record<string,string>;
const updates: Record<string,unknown>[] = [];
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] }, serve: (handler: typeof handle) => { handle=handler; } });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks(); updates.length=0;
  env={ CUSTOMER_WELCOME_WORKER_SECRET: 'fixture', RESEND_API_KEY: 'fixture', SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'fixture' };
  rpc.mockResolvedValue({ data: [{ id: 'job' }], error: null }); send.mockResolvedValue('provider');
  from.mockImplementation(() => ({ update: (value: Record<string,unknown>) => { updates.push(value); return { eq: async () => ({ error: null }) }; } }));
});
const request = (secret='fixture') => new Request('https://example.test/worker',{method:'POST',headers:{Authorization:`Bearer ${secret}`}});
it('rejects unauthenticated calls without reading private submissions', async () => {
  expect((await handle(request('wrong'))).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
it('records provider acceptance', async () => {
  expect(await (await handle(request())).json()).toEqual({accepted:1,failed:0});
  expect(updates[0]).toMatchObject({provider_id:'provider',last_error:null});
});
it('keeps provider errors retryable', async () => {
  send.mockRejectedValue(new Error('Delivery failed.'));
  expect((await handle(request())).status).toBe(502);
  expect(updates).toEqual([{last_error:'Delivery failed.'}]);
});
it('does not claim jobs without provider credentials', async () => {
  env.RESEND_API_KEY='';
  expect((await handle(request())).status).toBe(503);
  expect(rpc).not.toHaveBeenCalled();
});
