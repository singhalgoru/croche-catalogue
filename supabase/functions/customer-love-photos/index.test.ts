// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const { auth, userRpc, serviceRpc, storageFetch } = vi.hoisted(() => ({
  auth: { getUser: vi.fn() }, userRpc: vi.fn(), serviceRpc: vi.fn(), storageFetch: vi.fn(),
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: (_url: string, key: string) => key === 'service-fixture' ? { rpc: serviceRpc } : { auth, rpc: userRpc },
}));
vi.mock('https://esm.sh/aws4fetch@1.0.20', () => ({ AwsClient: class { fetch = storageFetch; } }));

const env: Record<string, string> = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon-fixture', SUPABASE_SERVICE_ROLE_KEY: 'service-fixture',
  R2_ACCOUNT_ID: 'account', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'public',
  R2_PUBLIC_URL: 'https://images.example.test/',
};
let handle: (request: Request) => Promise<Response>;
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] }, serve: (handler: typeof handle) => { handle = handler; } });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());

const id = '00000000-0000-4000-8000-000000000001';
const sha = 'abcdef0123456789'.repeat(4);
const bucket = 'https://account.r2.cloudflarestorage.com/public';
const listing = (...keys: string[]) => new Response(`<ListBucketResult>${keys.map(key => `<Key>${key}</Key>`).join('')}<IsTruncated>false</IsTruncated></ListBucketResult>`);
const request = (body: unknown = { id }) => new Request('https://example.test/customer-love-photos', {
  method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  auth.getUser.mockResolvedValue({ data: { user: { id: 'admin' } }, error: null });
  userRpc.mockResolvedValue({ data: true, error: null });
  storageFetch.mockResolvedValue(new Response(null, { status: 200 }));
});

it('uploads a published photo to customer-reviews in R2, records its URL and removes replaced copies', async () => {
  const old = `customer-reviews/${id}-1111111111111111.webp`;
  storageFetch.mockResolvedValueOnce(listing(old));
  serviceRpc.mockImplementation(async (name: string) => name === 'customer_love_photo_sources'
    ? { data: [{ id, sha256: sha, photo: btoa('webp-bytes') }], error: null } : { data: true, error: null });
  const response = await handle(request());
  expect(response.status).toBe(200);
  const key = `customer-reviews/${id}-${sha.slice(0, 16)}.webp`;
  expect(storageFetch).toHaveBeenCalledWith(`${bucket}?list-type=2&prefix=customer-reviews%2F${id}-`);
  expect(storageFetch).toHaveBeenCalledWith(`${bucket}/${key}`, expect.objectContaining({
    method: 'PUT', headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' },
  }));
  expect(serviceRpc).toHaveBeenCalledWith('set_customer_love_image_url',
    { testimonial_id: id, image_sha256: sha, url: `https://images.example.test/${key}` });
  expect(storageFetch).toHaveBeenCalledWith(`${bucket}/${old}`, { method: 'DELETE' });
  expect(await response.json()).toEqual({ results: [{ id, published: true, removed: 1, changed: false }] });
});

it('removes every R2 copy when a testimonial is withdrawn, deleted or loses its photo', async () => {
  const copy = `customer-reviews/${id}-${sha.slice(0, 16)}.webp`;
  storageFetch.mockResolvedValueOnce(listing(copy));
  serviceRpc.mockImplementation(async (name: string) => name === 'customer_love_photo_sources'
    ? { data: [], error: null } : { data: true, error: null });
  const response = await handle(request());
  expect(serviceRpc).toHaveBeenCalledWith('set_customer_love_image_url', { testimonial_id: id, image_sha256: null, url: null });
  expect(storageFetch).toHaveBeenCalledWith(`${bucket}/${copy}`, { method: 'DELETE' });
  expect(storageFetch).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'PUT' }));
  expect(await response.json()).toEqual({ results: [{ id, published: false, removed: 1, changed: false }] });
});

it('reconciles all testimonials and orphaned R2 copies without reading photos for the listing', async () => {
  const orphan = '00000000-0000-4000-8000-000000000002';
  storageFetch.mockResolvedValueOnce(listing(`customer-reviews/${orphan}-${sha.slice(0, 16)}.webp`));
  serviceRpc.mockImplementation(async (name: string, args: { testimonial_id: string | null }) => name === 'customer_love_photo_sources'
    ? { data: args.testimonial_id ? [] : [{ id, sha256: null, photo: null }], error: null } : { data: true, error: null });
  const response = await handle(request({}));
  expect(serviceRpc).toHaveBeenCalledWith('customer_love_photo_sources', { testimonial_id: null, include_photo: false });
  expect((await response.json()).results.map((item: { id: string }) => item.id)).toEqual([id, orphan]);
});

it('requires a verified admin or database-verified operator and a valid reference', async () => {
  userRpc.mockResolvedValueOnce({ data: false, error: null });
  expect((await handle(request())).status).toBe(403);
  expect((await handle(request({ id: 'not-an-id' }))).status).toBe(400);
  expect(serviceRpc).not.toHaveBeenCalled();
  expect((await handle(new Request('https://example.test', { method: 'POST' }))).status).toBe(401);
  auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'invalid' } });
  userRpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
  expect((await handle(request())).status).toBe(401);
  expect(serviceRpc).not.toHaveBeenCalled();
});

it('lets operators reconcile with a service-role token verified by the database', async () => {
  auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'no user' } });
  userRpc.mockResolvedValueOnce({ data: [], error: null });
  storageFetch.mockResolvedValueOnce(listing());
  serviceRpc.mockResolvedValue({ data: [], error: null });
  const response = await handle(request({}));
  expect(response.status).toBe(200);
  expect(userRpc).toHaveBeenCalledWith('customer_love_photo_sources', { testimonial_id: null, include_photo: false });
});

it('reports R2 failures without claiming success', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  storageFetch.mockResolvedValueOnce(new Response('denied', { status: 403 }));
  const response = await handle(request());
  expect(response.status).toBe(502);
  expect((await response.json()).error).toContain('R2 listing failed');
  log.mockRestore();
});
