// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { buildPlan, parseCreationInput } from './meta';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), rpc: vi.fn(), readCreation: vi.fn(), readDraft: vi.fn(), readProduct: vi.fn(),
  insert: vi.fn(), claim: vi.fn(), update: vi.fn(), loadMetaAccess: vi.fn(),
  recoveryClaim: vi.fn(), verifyRecovery: vi.fn(),
}));
vi.mock('./recovery.ts', async importOriginal => ({
  ...await importOriginal<typeof import('./recovery')>(), verifyRecovery: mocks.verifyRecovery,
}));
vi.mock('../_shared/loadMetaAccess.ts', () => ({ loadMetaAccess: mocks.loadMetaAccess }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser }, rpc: mocks.rpc,
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: table === 'marketing_campaign_drafts'
        ? mocks.readDraft : table === 'products' ? mocks.readProduct : mocks.readCreation }) }),
      insert: (value: unknown) => { mocks.insert(value); return { select: () => ({ single: mocks.claim }) }; },
      update: (value: unknown) => {
        const builder = {
          eq: () => builder, is: () => builder,
          select: () => ({ single: () => mocks.update(value), maybeSingle: () => mocks.recoveryClaim(value) }),
        };
        return builder;
      },
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
  mocks.recoveryClaim.mockResolvedValue({ data: null, error: null });
  mocks.verifyRecovery.mockResolvedValue(undefined);
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

it('checks Instagram connection without reserving or writing any object', async () => {
  fetcher.mockResolvedValueOnce(response({ id: '456', instagram_business_account: { id: '999', username: 'luvia' } }))
    .mockResolvedValueOnce(response({ data: [{ id: '999' }] }));
  const result = await handle(request({ action: 'setup-instagram' }));
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ setup: { instagram: { id: '999', username: 'luvia' } } });
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.recoveryClaim).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});

it('rejects changed Instagram identity before claiming or creating a campaign', async () => {
  fetcher.mockResolvedValueOnce(response({ id: '456', instagram_business_account: { id: '998', username: 'changed' } }));
  const result = await handle(request({ ...input, placement: 'instagram-feed', instagramUserId: '999' }));
  expect(result.status).toBe(502);
  expect(await result.json()).toMatchObject({ error: expect.stringContaining('identity changed') });
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});

it('persists Instagram placement and identity only after verification and before paused writes', async () => {
  fetcher.mockResolvedValueOnce(response({ id: '456', instagram_business_account: { id: '999', username: 'luvia' } }))
    .mockResolvedValueOnce(response({ data: [{ id: '999' }] }));
  for (const body of [{ id: '10' }, { id: '20' }, { id: '30' }, { id: '40' },
    { id: '10', status: 'PAUSED' }, { id: '20', status: 'PAUSED' }, { id: '40', status: 'PAUSED' }]) {
    fetcher.mockResolvedValueOnce(response(body));
  }
  const result = await handle(request({ ...input, placement: 'instagram-feed', instagramUserId: '999' }));
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ creation: { status: 'created' } });
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
    request: expect.objectContaining({ placement: 'instagram-feed', instagramUserId: '999',
      plan: expect.objectContaining({ placement: 'instagram-feed', instagramUserId: '999' }) }),
  }));
  const writes = fetcher.mock.calls.filter(([, options]) => options.method === 'POST');
  expect(writes).toHaveLength(4);
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

function recoverableRow() {
  const plan = buildPlan({ status: 'approved', proposal }, {
    published: true, image_url: 'https://images.luviacreations.com/flower.webp',
  }, parseCreationInput(input), undefined);
  return {
    ...creation, status: 'needs_attention', campaign_id: '10', adset_id: '20',
    recovery_started_at: null, updated_at: '2030-01-01T00:00:00Z',
    error: 'Meta object request failed (HTTP 400, code 100, subcode 1885183). Check permissions and account setup in Meta.',
    request: { ...parseCreationInput(input), plan, geo: { countries: ['IN'] }, pageId: '456', pixelId: null },
  };
}
const recoveryRequest = (action = 'recover') => request({
  action, draftId: input.draftId, ...(action === 'recover' ? { confirmPaused: true, confirmNoManualAd: true } : {}),
});

it('gates recovery with fresh admin verification, explicit confirmation and the feature flag', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
  expect((await handle(recoveryRequest())).status).toBe(403);
  expect((await handle(request({ action: 'recover', draftId: input.draftId }))).status).toBe(400);
  env.META_PAUSED_CREATION_ENABLED = 'false';
  expect((await handle(recoveryRequest())).status).toBe(503);
  expect(mocks.verifyRecovery).not.toHaveBeenCalled();
  expect(mocks.recoveryClaim).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});

it('reviews original saved details without claiming recovery or sending writes', async () => {
  mocks.readCreation.mockResolvedValueOnce({ data: recoverableRow(), error: null });
  const result = await handle(recoveryRequest('review-recovery'));
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ recovery: {
    campaignId: '10', adsetId: '20', locationLabel: 'India',
    plan: { primaryText: 'First copy', imageUrl: 'https://images.luviacreations.com/flower.webp', lifetimeBudget: 350000 },
  } });
  expect(mocks.verifyRecovery).toHaveBeenCalledTimes(1);
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.recoveryClaim).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});

it('stops a competing or repeated recovery before any POST', async () => {
  mocks.readCreation.mockResolvedValueOnce({ data: recoverableRow(), error: null });
  expect((await handle(recoveryRequest())).status).toBe(409);
  expect(mocks.recoveryClaim).toHaveBeenCalledTimes(1);
  expect(fetcher).not.toHaveBeenCalled();
  mocks.readCreation.mockResolvedValueOnce({ data: { ...recoverableRow(), recovery_started_at: new Date().toISOString() }, error: null });
  expect((await handle(recoveryRequest())).status).toBe(409);
  expect(mocks.recoveryClaim).toHaveBeenCalledTimes(1);
});

it('completes only creative and ad after an atomic recovery claim and a second read-only verification', async () => {
  const row = recoverableRow();
  mocks.readCreation.mockResolvedValueOnce({ data: row, error: null });
  mocks.recoveryClaim.mockResolvedValueOnce({ data: { ...row, status: 'creating', recovery_started_at: new Date().toISOString() }, error: null });
  fetcher.mockReset().mockResolvedValueOnce(response({ id: '30' })).mockResolvedValueOnce(response({ id: '40' }))
    .mockResolvedValueOnce(response({ id: '10', status: 'PAUSED' })).mockResolvedValueOnce(response({ id: '20', status: 'PAUSED' }))
    .mockResolvedValueOnce(response({ id: '40', status: 'PAUSED' }));
  const result = await handle(recoveryRequest());
  expect(await result.json()).toMatchObject({ creation: { status: 'created', creative_id: '30', ad_id: '40' } });
  expect(mocks.verifyRecovery).toHaveBeenCalledTimes(2);
  expect(mocks.recoveryClaim).toHaveBeenCalledWith(expect.objectContaining({ status: 'creating', recovery_started_at: expect.any(String) }));
  expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST').map(([url]) => new URL(url).pathname))
    .toEqual(['/v27.0/act_123/adcreatives', '/v27.0/act_123/ads']);
  expect(mocks.insert).not.toHaveBeenCalled();
});

it('preserves partial recovery progress on failure and never retries the provider write', async () => {
  const row = recoverableRow();
  mocks.readCreation.mockResolvedValueOnce({ data: row, error: null });
  mocks.recoveryClaim.mockResolvedValueOnce({ data: { ...row, status: 'creating', recovery_started_at: new Date().toISOString() }, error: null });
  fetcher.mockReset().mockResolvedValueOnce(response({ id: '30' })).mockRejectedValueOnce(new Error('secret-fixture'));
  const result = await handle(recoveryRequest());
  const body = await result.text();
  expect(JSON.parse(body)).toMatchObject({ creation: { status: 'needs_attention', creative_id: '30', ad_id: null } });
  expect(body).not.toContain('secret-fixture');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('sends no writes if an object changes after the recovery claim', async () => {
  const row = recoverableRow();
  mocks.readCreation.mockResolvedValueOnce({ data: row, error: null });
  mocks.recoveryClaim.mockResolvedValueOnce({ data: { ...row, status: 'creating', recovery_started_at: new Date().toISOString() }, error: null });
  mocks.verifyRecovery.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('An ad already exists.'));
  const result = await handle(recoveryRequest());
  expect(await result.json()).toMatchObject({ creation: { status: 'needs_attention', error: 'An ad already exists.' } });
  expect(mocks.recoveryClaim).toHaveBeenCalledTimes(1);
  expect(fetcher).not.toHaveBeenCalled();
});
