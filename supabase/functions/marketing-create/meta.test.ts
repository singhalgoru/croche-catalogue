// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { buildPlan, createPausedObjects, creationSettings, instagramIdentity, parseCreationInput, preflight, resolveLocations } from './meta';

const config = { accessToken: 'secret-fixture', accountId: '123', graphApiVersion: 'v27.0' };
const settings = { pageId: '456', pixelId: '789' };
const input = {
  action: 'create', confirmPaused: true,
  draftId: '00000000-0000-4000-8000-000000000001', productId: '00000000-0000-4000-8000-000000000002',
  primaryTextIndex: 1, headlineIndex: 0, startTime: '2030-01-02T10:00:00.000Z', locations: null,
};
const proposal = {
  campaignName: 'Crochet flowers', goal: 'sales', dailyBudgetInr: 500, durationDays: 7, totalBudgetInr: 3500,
  landingPageUrl: 'https://luviacreations.com/p/flowers/', primaryText: ['First copy', 'Second copy'],
  headlines: ['First headline', 'Second headline'], description: 'Handmade flowers', callToAction: 'Shop now',
};
const draft = { status: 'approved', proposal };
const product = { published: true, image_url: 'https://images.luviacreations.com/products/flowers.webp' };
const now = Date.parse('2030-01-02T09:00:00.000Z');
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const plan = () => buildPlan(draft, product, parseCreationInput(input), settings.pixelId, now);
afterEach(() => vi.restoreAllMocks());

it('requires explicit paused confirmation and server-controlled statuses and account', () => {
  expect(parseCreationInput(input)).toMatchObject({ primaryTextIndex: 1, locations: null });
  for (const change of [{ confirmPaused: false }, { status: 'ACTIVE' }, { accountId: 'other' },
    { primaryTextIndex: 2 }, { locations: [] }, { startTime: 'bad' },
    { placement: 'instagram-reels' }, { placement: 'instagram-feed' }, { instagramUserId: '999' }]) {
    expect(() => parseCreationInput({ ...input, ...change })).toThrow();
  }
  expect(() => creationSettings(() => undefined)).toThrow('disabled');
});

it('verifies a Page-linked Instagram identity against the complete ad-account assignment with GET only', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({ id: '456', instagram_business_account: { id: '999', username: 'luvia.test' } }))
    .mockResolvedValueOnce(response({ data: [{ id: '998' }], paging: { next: 'https://ignored.test', cursors: { after: 'cursor-1' } } }))
    .mockResolvedValueOnce(response({ data: [{ id: '999' }] }));
  await expect(instagramIdentity(config, settings, '999', fetcher)).resolves.toEqual({ id: '999', username: 'luvia.test' });
  expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
  expect(String(fetcher.mock.calls[2][0])).toContain('after=cursor-1');
  expect(fetcher.mock.calls.every(([url]) => new URL(url).hostname === 'graph.facebook.com')).toBe(true);
});

it.each([
  { page: { id: '456' }, accounts: { data: [] } },
  { page: { id: '456', instagram_business_account: { id: '998', username: 'another' } }, accounts: { data: [{ id: '998' }] } },
  { page: { id: '456', instagram_business_account: { id: '999', username: 'luvia' } }, accounts: { data: [] } },
  { page: { id: '456', instagram_business_account: { id: '999', username: 'luvia' } }, accounts: { data: [{ id: '999' }, { id: '999' }] } },
])('blocks missing, changed or unauthorized Instagram identities (%j)', async ({ page, accounts }) => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(page)).mockResolvedValueOnce(response(accounts));
  await expect(instagramIdentity(config, settings, '999', fetcher)).rejects.toThrow();
  expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});

it.each(['sales', 'traffic', 'awareness'] as const)('creates Instagram Feed-only %s objects under the confirmed identity, all paused', async goal => {
  const parsed = parseCreationInput({ ...input, placement: 'instagram-feed', instagramUserId: '999' });
  const instagramPlan = buildPlan(draft, product, parsed, settings.pixelId, now);
  expect(instagramPlan).toMatchObject({ placement: 'instagram-feed', instagramUserId: '999' });
  const fetcher = vi.fn();
  for (const body of [{ id: '10' }, { id: '20' }, { id: '30' }, { id: '40' },
    { id: '10', status: 'PAUSED' }, { id: '20', status: 'PAUSED' }, { id: '40', status: 'PAUSED' }]) {
    fetcher.mockResolvedValueOnce(response(body));
  }
  await createPausedObjects(config, settings, { ...instagramPlan, goal }, { countries: ['IN'] }, vi.fn(), fetcher);
  const parameters = fetcher.mock.calls.slice(0, 4).map(([, options]) => options.body as URLSearchParams);
  expect(parameters[1].get('name')).toBe('Crochet flowers - Instagram Feed');
  const targeting = JSON.parse(parameters[1].get('targeting')!);
  expect(targeting.publisher_platforms).toEqual(['instagram']);
  expect(targeting.instagram_positions).toEqual(['stream']);
  expect(targeting.facebook_positions).toBeUndefined();
  expect(JSON.parse(parameters[2].get('object_story_spec')!)).toMatchObject({
    page_id: '456', instagram_user_id: '999', link_data: { picture: product.image_url, message: 'Second copy' },
  });
  expect([parameters[0], parameters[1], parameters[3]].every(body => body.get('status') === 'PAUSED')).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(7);
});

it('uses the immutable approved copy and full lifetime budget in paise with a fixed end time', () => {
  expect(plan()).toMatchObject({
    primaryText: 'Second copy', headline: 'First headline', lifetimeBudget: 350000,
    startTime: input.startTime, endTime: '2030-01-09T10:00:00.000Z',
  });
  expect(() => buildPlan({ ...draft, status: 'draft' }, product, parseCreationInput(input), '789', now)).toThrow('approved');
  expect(() => buildPlan(draft, { ...product, published: false }, parseCreationInput(input), '789', now)).toThrow('published');
  expect(() => buildPlan(draft, product, parseCreationInput(input), undefined, now)).toThrow('pixel');
  expect(() => buildPlan(draft, product, parseCreationInput(input), '789', now + 3600000)).toThrow('start time');
  for (const changes of [{ dailyBudgetInr: 1 }, { totalBudgetInr: 1 },
    { landingPageUrl: 'https://other.test/' }, { callToAction: 'Send message' }]) {
    expect(() => buildPlan({ ...draft, proposal: { ...proposal, ...changes } }, product, parseCreationInput(input), '789', now)).toThrow();
  }
});

it('verifies write permission, the active INR account, page and sales pixel without mutations', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(response({ data: [{ permission: 'ads_management', status: 'granted' }] }))
    .mockResolvedValueOnce(response({ id: 'act_123', name: 'Account', currency: 'INR', account_status: 1 }))
    .mockResolvedValueOnce(response({ id: '456', name: 'Page' }))
    .mockResolvedValueOnce(response({ id: '789' }));
  await expect(preflight(config, settings, true, fetcher)).resolves.toMatchObject({ pageId: '456', accountId: '123' });
  expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
  fetcher.mockReset().mockResolvedValueOnce(response({ data: [{ permission: 'ads_read', status: 'granted' }] }));
  await expect(preflight(config, settings, false, fetcher)).rejects.toThrow('ads_management');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('treats a declined Instagram permission as missing without looking up the linked profile', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({ data: [
    { permission: 'ads_management', status: 'granted' }, { permission: 'pages_show_list', status: 'granted' },
    { permission: 'instagram_basic', status: 'declined' },
  ] }));
  await expect(preflight(config, settings, false, fetcher, 'instagram-feed')).rejects.toThrow('Reconnect Meta with instagram_basic');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1].method).toBe('GET');
});

it('revalidates Meta keys against Indian search results and never translates labels into targeting', async () => {
  const fetcher = vi.fn().mockImplementation(async () => response({ data: [
    { key: 'city-1', name: 'Mumbai', region: 'Maharashtra', country_code: 'IN', type: 'city' },
    { key: 'foreign', name: 'Other', country_code: 'US', type: 'city' },
  ] }));
  await expect(resolveLocations(config, [{ key: 'city-1', type: 'city', label: 'Mumbai, Maharashtra, India' }], fetcher))
    .resolves.toEqual({ cities: [{ key: 'city-1' }] });
  await expect(resolveLocations(config, [{ key: 'foreign', type: 'city', label: 'Other' }], fetcher)).rejects.toThrow('verified in India');
  await expect(resolveLocations(config, null, fetcher)).resolves.toEqual({ countries: ['IN'] });
});

it('identifies failed Page setup with safe error codes and permission hints, never raw provider details', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const fetcher = vi.fn()
    .mockResolvedValueOnce(response({ data: [{ permission: 'ads_management', status: 'granted' }] }))
    .mockResolvedValueOnce(response({ id: 'act_123', name: 'Account', currency: 'INR', account_status: 1 }))
    .mockResolvedValueOnce(response({ error: {
      code: 100, error_subcode: 33, message: `${config.accessToken} requires pages_read_engagement https://private.test`,
    } }, 400));
  const failure = preflight(config, settings, false, fetcher);
  await expect(failure).rejects.toThrow('Facebook Page lookup failed (HTTP 400, code 100, subcode 33)');
  await expect(failure).rejects.toThrow('pages_read_engagement');
  await expect(failure).rejects.not.toThrow(config.accessToken);
  expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
  expect(log).toHaveBeenCalledWith('Meta request failed.', {
    operation: 'Facebook Page lookup', status: 400, code: 100, subcode: 33, permissions: ['pages_read_engagement'],
  });
  expect(JSON.stringify(log.mock.calls)).not.toContain(config.accessToken);
  expect(JSON.stringify(log.mock.calls)).not.toContain('private.test');
});

it('gives reconnect guidance for an invalid token and preserves HTTP diagnostics for malformed errors', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const fetcher = vi.fn().mockResolvedValueOnce(response({ error: { code: 190, message: config.accessToken } }, 400));
  await expect(preflight(config, settings, false, fetcher)).rejects.toThrow('Reconnect Meta');
  fetcher.mockReset().mockResolvedValueOnce(new Response(config.accessToken, { status: 400 }));
  const failure = preflight(config, settings, false, fetcher);
  await expect(failure).rejects.toThrow('permission check failed (HTTP 400)');
  await expect(failure).rejects.not.toThrow(config.accessToken);
});

it.each(['sales', 'traffic', 'awareness'] as const)('creates a fully paused %s campaign and verifies all delivery statuses', async goal => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(response({ id: '10' })).mockResolvedValueOnce(response({ id: '20' }))
    .mockResolvedValueOnce(response({ id: '30' })).mockResolvedValueOnce(response({ id: '40' }))
    .mockResolvedValueOnce(response({ id: '10', status: 'PAUSED' }))
    .mockResolvedValueOnce(response({ id: '20', status: 'PAUSED' }))
    .mockResolvedValueOnce(response({ id: '40', status: 'PAUSED' }));
  const checkpoint = vi.fn().mockResolvedValue(undefined);
  await createPausedObjects(config, settings, { ...plan(), goal }, { countries: ['IN'] }, checkpoint, fetcher);
  const parameters = fetcher.mock.calls.slice(0, 4).map(([, options]) => options.body as URLSearchParams);
  expect(parameters[0].get('status')).toBe('PAUSED');
  expect(parameters[1].get('status')).toBe('PAUSED');
  expect(parameters[3].get('status')).toBe('PAUSED');
  expect(parameters[1].get('lifetime_budget')).toBe('350000');
  expect(parameters[1].has('daily_budget')).toBe(false);
  expect(parameters[1].get('optimization_goal')).toBe(goal === 'sales' ? 'OFFSITE_CONVERSIONS' : goal === 'traffic' ? 'LINK_CLICKS' : 'REACH');
  if (goal === 'awareness') {
    expect(JSON.parse(parameters[1].get('promoted_object')!)).toEqual({ page_id: '456' });
    expect(parameters[1].has('destination_type')).toBe(false);
  } else {
    expect(parameters[1].get('destination_type')).toBe('WEBSITE');
  }
  expect(JSON.parse(parameters[1].get('targeting')!)).toMatchObject({ geo_locations: { countries: ['IN'] }, publisher_platforms: ['facebook'] });
  expect(JSON.parse(parameters[2].get('object_story_spec')!)).toMatchObject({
    page_id: '456', link_data: { message: 'Second copy', name: 'First headline', picture: product.image_url },
  });
  expect(checkpoint.mock.calls).toEqual([[{ campaign_id: '10' }], [{ adset_id: '20' }], [{ creative_id: '30' }], [{ ad_id: '40' }]]);
  for (const [url, options] of fetcher.mock.calls) {
    expect(String(url)).toMatch(/^https:\/\/graph\.facebook\.com\/v27\.0\//);
    expect(String(url)).not.toContain(config.accessToken);
    expect(options.headers.Authorization).toBe(`Bearer ${config.accessToken}`);
  }
});

it('stops after partial failure or lost checkpoint without retrying writes or exposing provider bodies', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({ id: '10' }))
    .mockResolvedValueOnce(response({ error: { message: config.accessToken } }, 400));
  const checkpoint = vi.fn().mockResolvedValue(undefined);
  await expect(createPausedObjects(config, settings, plan(), { countries: ['IN'] }, checkpoint, fetcher)).rejects.toThrow('HTTP 400');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(checkpoint).toHaveBeenCalledWith({ campaign_id: '10' });
  fetcher.mockReset().mockResolvedValueOnce(response({ id: '10' }));
  checkpoint.mockRejectedValueOnce(new Error('Checkpoint failed'));
  await expect(createPausedObjects(config, settings, plan(), { countries: ['IN'] }, checkpoint, fetcher)).rejects.toThrow('Checkpoint failed');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
