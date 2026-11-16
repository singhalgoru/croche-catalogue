// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const { getUser, rpc } = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({ auth: { getUser }, rpc }),
}));

const env: Record<string, string> = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-fixture',
  META_ACCESS_TOKEN: 'top-secret-fixture',
  META_AD_ACCOUNT_ID: 'act_12345',
  META_GRAPH_API_VERSION: 'v99.0',
};
let handle: (request: Request) => Promise<Response>;
const fetcher = vi.fn();

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => env[name] },
    serve: (handler: typeof handle) => { handle = handler; },
  });
  vi.stubGlobal('fetch', fetcher);
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());

const request = (body: string | null = '{}') => new Request('https://example.test/marketing-read', {
  method: 'POST',
  headers: { Authorization: 'Bearer user-session', 'Content-Type': 'application/json' },
  body,
});
const upstream = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'admin' } }, error: null });
  rpc.mockResolvedValue({ data: true, error: null });
  fetcher
    .mockResolvedValueOnce(upstream({ id: 'act_12345', name: 'Luvia', currency: 'INR', timezone_name: 'Asia/Kolkata', account_status: 1 }))
    .mockResolvedValueOnce(upstream({ data: [] }))
    .mockResolvedValueOnce(upstream({ data: [] }));
});

it('serves Meta data only to verified admins and never returns credentials', async () => {
  const response = await handle(request());
  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  expect(body).toMatchObject({ account: { id: 'act_12345' }, campaigns: [], metrics: { spend: 0 } });
  expect(rpc).toHaveBeenCalledWith('is_catalogue_admin');
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(body)).not.toContain(env.META_ACCESS_TOKEN);
});

it('rejects unauthenticated, non-admin and non-empty requests before calling Meta', async () => {
  const preflight = await handle(new Request('https://example.test/marketing-read', { method: 'OPTIONS' }));
  expect(preflight.status).toBe(200);
  expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
  expect((await handle(new Request('https://example.test', { method: 'POST' }))).status).toBe(401);
  rpc.mockResolvedValueOnce({ data: false, error: null });
  expect((await handle(request())).status).toBe(403);
  expect((await handle(request('{"action":"activate"}'))).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});

it('reports missing credentials explicitly without making a Meta request', async () => {
  delete env.META_ACCESS_TOKEN;
  const response = await handle(request());
  env.META_ACCESS_TOKEN = 'top-secret-fixture';
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain('META_ACCESS_TOKEN');
  expect(fetcher).not.toHaveBeenCalled();
});

it('does not echo Meta error bodies or tokens to the caller', async () => {
  fetcher.mockReset().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: env.META_ACCESS_TOKEN } }), { status: 400 }));
  const response = await handle(request());
  expect(response.status).toBe(502);
  const body = await response.text();
  expect(body).toContain('status 400');
  expect(body).not.toContain(env.META_ACCESS_TOKEN);
});
