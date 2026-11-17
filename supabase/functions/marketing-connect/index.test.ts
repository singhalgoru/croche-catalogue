// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const { getUser, rpc, upsert } = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), upsert: vi.fn() }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: (_url: string, key: string) => key === 'service'
    ? { from: () => ({ upsert }) } : { auth: { getUser }, rpc },
}));
const env: Record<string, string> = {
  SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
  META_APP_ID: '123', META_APP_SECRET: 'secret-fixture', META_LOGIN_CONFIG_ID: '456',
  META_OAUTH_REDIRECT_URI: 'https://example.test/meta-oauth-callback.html',
  META_GRAPH_API_VERSION: 'v27.0', META_OAUTH_STATE_SECRET: 'x'.repeat(48),
  META_TOKEN_ENCRYPTION_KEY: btoa('k'.repeat(32)), META_AD_ACCOUNT_ID: '1234',
};
let handler: (request: Request) => Promise<Response>;
const fetcher = vi.fn();
const request = (body: object) => new Request('https://example.test', {
  method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const upstream = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] }, serve: (value: typeof handler) => { handler = value; } });
  vi.stubGlobal('fetch', fetcher);
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'admin' } }, error: null });
  rpc.mockResolvedValue({ data: true, error: null });
  upsert.mockResolvedValue({ error: null });
});

it('requires fresh admin authorization before starting or completing a login', async () => {
  rpc.mockResolvedValue({ data: false, error: null });
  expect((await handler(request({ action: 'start' }))).status).toBe(403);
  expect((await handler(request({ action: 'complete', state: 'x', code: 'x' }))).status).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
  expect(upsert).not.toHaveBeenCalled();
});

it('saves only an encrypted validated token and does not replace it on failed authorization', async () => {
  const start = await handler(request({ action: 'start' }));
  const { state } = await start.json();
  fetcher
    .mockResolvedValueOnce(upstream({ access_token: 'short' }))
    .mockResolvedValueOnce(upstream({ access_token: 'long-secret', expires_in: '5183944' }))
    .mockResolvedValueOnce(upstream({ id: 'act_1234', name: 'Account', currency: 'INR', timezone_name: 'Asia/Kolkata', account_status: 1 }))
    .mockResolvedValueOnce(upstream({ data: [] }))
    .mockResolvedValueOnce(upstream({ data: [] }));
  const result = await handler(request({ action: 'complete', code: 'code', state }));
  expect(result.status).toBe(200);
  expect(await result.text()).not.toContain('long-secret');
  expect(upsert).toHaveBeenCalledOnce();
  expect(JSON.stringify(upsert.mock.calls)).not.toContain('long-secret');
  upsert.mockClear();
  fetcher.mockReset().mockResolvedValueOnce(upstream({}, 400));
  expect((await handler(request({ action: 'complete', code: 'bad', state }))).status).toBe(502);
  expect(upsert).not.toHaveBeenCalled();
  expect((await handler(request({ action: 'complete', code: 'bad', state: `${state}x` }))).status).toBe(502);
  expect(upsert).not.toHaveBeenCalled();
});

it('does not replace the credential when the new token cannot read the configured account', async () => {
  const { state } = await (await handler(request({ action: 'start' }))).json();
  fetcher.mockReset()
    .mockResolvedValueOnce(upstream({ access_token: 'short' }))
    .mockResolvedValueOnce(upstream({ access_token: 'long', expires_in: 3600 }))
    .mockResolvedValueOnce(upstream({}, 403));
  expect((await handler(request({ action: 'complete', code: 'code', state }))).status).toBe(502);
  expect(upsert).not.toHaveBeenCalled();
});
