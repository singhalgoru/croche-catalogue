// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), rpc: vi.fn(), readCreation: vi.fn(), readDraft: vi.fn(), readProduct: vi.fn(),
  insert: vi.fn(), claim: vi.fn(), update: vi.fn(), loadMetaAccess: vi.fn(),
}));
vi.mock('../_shared/loadMetaAccess.ts', () => ({ loadMetaAccess: mocks.loadMetaAccess }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser }, rpc: mocks.rpc,
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: table === 'marketing_campaign_drafts'
        ? mocks.readDraft : table === 'products' ? mocks.readProduct : mocks.readCreation }) }),
      insert: (value: unknown) => { mocks.insert(value); return { select: () => ({ single: mocks.claim }) }; },
      update: (value: unknown) => ({ eq: () => ({ select: () => ({ single: () => mocks.update(value) }) }) }),
    }),
  }),
}));

const env: Record<string, string> = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon-fixture', SUPABASE_SERVICE_ROLE_KEY: 'service-fixture',
  META_PAUSED_CREATION_ENABLED: 'true', META_PAGE_ID: '456',
};
const input = {
  action: 'create', confirmPaused: true, draftId: '00000000-0000-4000-8000-000000000001',
  productId: '00000000-0000-4000-8000-000000000002', primaryTextIndex: 0, headlineIndex: 0,
  startTime: '', locations: null,
};
const proposal = {
  campaignName: 'Flowers', goal: 'traffic', dailyBudgetInr: 500, durationDays: 7, totalBudgetInr: 3500,
  landingPageUrl: 'https://luviacreations.com/p/flowers/', primaryText: ['First copy', 'Second copy'],
  headlines: ['First headline', 'Second headline'], description: 'Handmade flowers', callToAction: 'Shop now',
};
const creation = {
  draft_id: input.draftId, account_id: '123', campaign_id: null, adset_id: null, creative_id: null, ad_id: null,
  status: 'creating', error: null,
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const request = (body: unknown = input) => new Request('https://example.test/marketing-create', {
  method: 'POST', headers: { Authorization: 'Bearer session', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const fetcher = vi.fn();
let handle: (request: Request) => Promise<Response>;
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] }, serve: (handler: typeof handle) => { handle = handler; } });
  vi.stubGlobal('fetch', fetcher);
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.resetAllMocks();
  env.META_PAUSED_CREATION_ENABLED = 'true';
  input.startTime = new Date(Date.now() + 3600000).toISOString();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin' } }, error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.readCreation.mockResolvedValue({ data: null, error: null });
  mocks.readDraft.mockResolvedValue({ data: { status: 'approved', proposal }, error: null });
  mocks.readProduct.mockResolvedValue({ data: { published: true, image_url: 'https://images.luviacreations.com/flower.webp' }, error: null });
  mocks.loadMetaAccess.mockResolvedValue({ config: { accessToken: 'secret-fixture', accountId: '123', graphApiVersion: 'v27.0' } });
  mocks.claim.mockResolvedValue({ data: creation, error: null });
  let progress = { ...creation };
  mocks.update.mockImplementation(async updates => {
    progress = { ...progress, ...updates };
    return { data: progress, error: null };
  });
  fetcher.mockResolvedValueOnce(response({ data: [{ permission: 'ads_management', status: 'granted' }] }))
    .mockResolvedValueOnce(response({ id: 'act_123', name: 'Account', currency: 'INR', account_status: 1 }))
    .mockResolvedValueOnce(response({ id: '456', name: 'Page' }));
});

it('denies unauthenticated, password-only and non-admin calls before any ledger or provider access', async () => {
  expect((await handle(new Request('https://example.test', { method: 'POST' }))).status).toBe(401);
  mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
  expect((await handle(request())).status).toBe(403);
  expect(mocks.rpc).toHaveBeenCalledWith('is_catalogue_admin');
  expect(mocks.readCreation).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects activation inputs, unapproved drafts and a disabled feature without writes', async () => {
  expect((await handle(request({ ...input, status: 'ACTIVE' })))).toHaveProperty('status', 400);
  mocks.readDraft.mockResolvedValueOnce({ data: { status: 'draft', proposal }, error: null });
  expect((await handle(request())).status).toBe(409);
  env.META_PAUSED_CREATION_ENABLED = 'false';
  expect((await handle(request())).status).toBe(503);
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});

it('shows verified setup without creating objects or reserving an attempt', async () => {
  const result = await handle(request({ action: 'setup' }));
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ setup: { accountId: '123', pageName: 'Page', pixelId: null } });
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});

it('returns an existing attempt without another provider call, even when creation is disabled', async () => {
  mocks.readCreation.mockResolvedValueOnce({ data: { ...creation, status: 'needs_attention', campaign_id: '10' }, error: null });
  env.META_PAUSED_CREATION_ENABLED = 'false';
  const result = await handle(request());
  expect(await result.json()).toMatchObject({ creation: { status: 'needs_attention', campaign_id: '10' } });
  expect(fetcher).not.toHaveBeenCalled();
  expect(mocks.loadMetaAccess).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
});

it('reserves one attempt before writes and does not write when a competing request wins the unique claim', async () => {
  mocks.claim.mockResolvedValueOnce({ data: null, error: { code: '23505' } });
  expect((await handle(request())).status).toBe(409);
  expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
  expect(mocks.update).not.toHaveBeenCalled();
});

it('persists partial IDs and a visible needs-attention state without retrying or leaking provider errors', async () => {
  fetcher.mockResolvedValueOnce(response({ id: '10' }))
    .mockResolvedValueOnce(response({ error: { message: 'secret-fixture' } }, 400));
  const result = await handle(request());
  const body = await result.text();
  expect(JSON.parse(body)).toMatchObject({ creation: { status: 'needs_attention', campaign_id: '10', adset_id: null } });
  expect(body).not.toContain('secret-fixture');
  expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(2);
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
    draft_id: input.draftId, requested_by: 'admin', request: expect.objectContaining({ plan: expect.objectContaining({ lifetimeBudget: 350000 }) }),
  }));
});

it('records success only after every new delivery object is confirmed paused', async () => {
  fetcher.mockResolvedValueOnce(response({ id: '10' })).mockResolvedValueOnce(response({ id: '20' }))
    .mockResolvedValueOnce(response({ id: '30' })).mockResolvedValueOnce(response({ id: '40' }))
    .mockResolvedValueOnce(response({ id: '10', status: 'PAUSED' })).mockResolvedValueOnce(response({ id: '20', status: 'PAUSED' }))
    .mockResolvedValueOnce(response({ id: '40', status: 'PAUSED' }));
  const result = await handle(request());
  expect(await result.json()).toMatchObject({ creation: { status: 'created', campaign_id: '10', adset_id: '20', creative_id: '30', ad_id: '40' } });
  expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'created' }));
});

it('keeps all known IDs but records needs-attention when readback does not confirm paused status', async () => {
  fetcher.mockResolvedValueOnce(response({ id: '10' })).mockResolvedValueOnce(response({ id: '20' }))
    .mockResolvedValueOnce(response({ id: '30' })).mockResolvedValueOnce(response({ id: '40' }))
    .mockResolvedValueOnce(response({ id: '10', status: 'ACTIVE' }));
  const result = await handle(request());
  expect(await result.json()).toMatchObject({
    creation: { status: 'needs_attention', campaign_id: '10', adset_id: '20', creative_id: '30', ad_id: '40',
      error: 'Meta did not confirm PAUSED status. Inspect the new objects in Ads Manager.' },
  });
  expect(mocks.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'created' }));
  expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(4);
});
