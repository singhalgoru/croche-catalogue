// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { buildPlan, completePausedAd, parseCreationInput } from './meta';
import { parseRecoveryInput, recoverySnapshot, verifyRecovery } from './recovery';

const config = { accessToken: 'secret-fixture', accountId: '123', graphApiVersion: 'v27.0' };
const settings = { pageId: '456', pixelId: undefined };
const now = Date.parse('2030-01-02T09:00:00Z');
const input = {
  draftId: '00000000-0000-4000-8000-000000000001', productId: '00000000-0000-4000-8000-000000000002',
  primaryTextIndex: 1, headlineIndex: 0, startTime: '2030-01-02T10:00:00.000Z', locations: null,
};
const draft = { status: 'approved', proposal: {
  campaignName: 'Flowers', goal: 'traffic', dailyBudgetInr: 500, durationDays: 7, totalBudgetInr: 3500,
  landingPageUrl: 'https://luviacreations.com/p/flowers/', primaryText: ['First copy', 'Saved copy'],
  headlines: ['Saved headline', 'Other headline'], description: 'Handmade', callToAction: 'Shop now',
} };
const product = { published: true, image_url: 'https://images.luviacreations.com/flower.webp' };
const plan = buildPlan(draft, product, parseCreationInput({ ...input, action: 'create', confirmPaused: true }), undefined, now);
const row = {
  draft_id: input.draftId, status: 'needs_attention', account_id: '123', campaign_id: '10', adset_id: '20',
  creative_id: null, ad_id: null, recovery_started_at: null,
  error: 'Meta object request failed (HTTP 400, code 100, subcode 1885183). Check permissions and account setup in Meta.',
  request: { ...input, plan, geo: { countries: ['IN'] }, pageId: '456', pixelId: null },
};
const saved = () => recoverySnapshot(row, draft, product, config, settings, now);
const campaign = {
  id: '10', account_id: '123', status: 'PAUSED', name: 'Flowers', objective: 'OUTCOME_TRAFFIC',
  buying_type: 'AUCTION', special_ad_categories: [],
};
const adset = {
  id: '20', account_id: '123', campaign_id: '10', status: 'PAUSED', name: 'Flowers - Facebook Feed',
  lifetime_budget: '350000', daily_budget: '0', start_time: plan.startTime, end_time: plan.endTime,
  billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', optimization_goal: 'LINK_CLICKS',
  destination_type: 'WEBSITE', targeting: {
    age_min: 18, age_max: 65, publisher_platforms: ['facebook'], facebook_positions: ['feed'],
    geo_locations: { countries: ['IN'], location_types: ['home', 'recent'] }, targeting_automation: { advantage_audience: 0 },
  },
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function verificationFetch(changes: { campaign?: unknown; adset?: unknown; ads?: unknown; creatives?: unknown } = {}) {
  return vi.fn().mockResolvedValueOnce(response({ data: [{ permission: 'ads_management', status: 'granted' }] }))
    .mockResolvedValueOnce(response({ id: 'act_123', name: 'Account', currency: 'INR', account_status: 1 }))
    .mockResolvedValueOnce(response({ id: '456', name: 'Page' }))
    .mockResolvedValueOnce(response(changes.campaign ?? campaign))
    .mockResolvedValueOnce(response(changes.adset ?? adset))
    .mockResolvedValueOnce(response({ data: [{ id: '20' }] }))
    .mockResolvedValueOnce(response(changes.ads ?? { data: [] }))
    .mockResolvedValueOnce(response(changes.creatives ?? { data: [] }));
}
afterEach(() => vi.restoreAllMocks());

it('requires explicit recovery confirmations and rejects client replacement details', () => {
  expect(parseRecoveryInput({ action: 'review-recovery', draftId: input.draftId }).action).toBe('review-recovery');
  for (const change of [{}, { confirmPaused: true }, { confirmPaused: true, confirmNoManualAd: true, plan }]) {
    expect(() => parseRecoveryInput({ action: 'recover', draftId: input.draftId, ...change })).toThrow();
  }
  expect(parseRecoveryInput({ action: 'recover', draftId: input.draftId, confirmPaused: true, confirmNoManualAd: true }).action).toBe('recover');
});

it('reconstructs the saved selected copy and image, but refuses uncertain, changed or previously recovered attempts', () => {
  expect(saved()).toMatchObject({ campaignId: '10', adsetId: '20', plan: { primaryText: 'Saved copy', headline: 'Saved headline', imageUrl: product.image_url } });
  for (const change of [
    { status: 'creating' }, { error: 'Meta connection failed.' }, { creative_id: '30' }, { campaign_id: null },
    { ad_id: '40' }, { account_id: '999' }, { recovery_started_at: '2030-01-02T09:00:00Z' },
    { request: { ...row.request, pageId: '999' } },
    { request: { ...row.request, plan: { ...plan, primaryText: 'Changed' } } },
  ]) expect(() => recoverySnapshot({ ...row, ...change }, draft, product, config, settings, now)).toThrow();
  expect(() => recoverySnapshot(row, draft, { ...product, image_url: 'https://other.test/new.webp' }, config, settings, now)).toThrow('changed');
  expect(() => recoverySnapshot(row, draft, product, config, settings, now + 8 * 86400_000)).toThrow('schedule has ended');
});

it('preserves an existing near or past start without shifting dates, but still rejects a new campaign with that start', () => {
  const parsed = parseCreationInput({ ...input, action: 'create', confirmPaused: true });
  for (const reviewTime of [now + 59 * 60_000, now + 2 * 3600000]) {
    const snapshot = recoverySnapshot(row, draft, product, config, settings, reviewTime);
    expect(snapshot.plan.startTime).toBe(plan.startTime);
    expect(snapshot.plan.endTime).toBe(plan.endTime);
    expect(snapshot.plan.lifetimeBudget).toBe(plan.lifetimeBudget);
    expect(() => buildPlan(draft, product, parsed, undefined, reviewTime)).toThrow('start time');
  }
});
it('verifies existing paused objects and complete listings using GET only', async () => {
  const fetcher = verificationFetch({ creatives: {
    data: [{ id: '99', name: 'Other campaign' }], paging: { next: 'https://ignored.test/secret', cursors: { after: 'cursor-1' } },
  } }).mockResolvedValueOnce(response({ data: [] }));
  await verifyRecovery(config, settings, saved(), fetcher);
  expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
  expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain('after=cursor-1');
  expect(fetcher.mock.calls.some(([url]) => String(url).includes('ignored.test'))).toBe(false);
});

it.each([
  { countries: ['IN'] },
  { countries: ['IN'], location_types: ['recent', 'home'] },
  { countries: ['IN'], location_types: ['frequently_in', 'home', 'recent'] },
])('accepts default presence readbacks without changing the saved geography (%j)', async geo => {
  const snapshot = saved();
  const fetcher = verificationFetch({ adset: { ...adset, targeting: { ...adset.targeting, geo_locations: geo } } });
  await verifyRecovery(config, settings, snapshot, fetcher);
  expect(snapshot.geo).toEqual({ countries: ['IN'] });
  expect(fetcher).toHaveBeenCalledTimes(8);
  expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});

it.each([
  { campaign: { ...campaign, status: 'ACTIVE' } },
  { campaign: { ...campaign, account_id: '999' } },
  { adset: { ...adset, status: 'ACTIVE' } },
  { adset: { ...adset, lifetime_budget: '400000' } },
  { adset: { ...adset, end_time: '2030-01-10T10:00:00Z' } },
  { adset: { ...adset, targeting: { ...adset.targeting, publisher_platforms: ['facebook', 'instagram'] } } },
  { adset: { ...adset, targeting: { ...adset.targeting, excluded_geo_locations: { countries: ['IN'] } } } },
  { ads: { data: [{ id: '40' }] } },
  { creatives: { data: [{ id: '30', name: 'Flowers' }] } },
  { creatives: { data: [], paging: { next: 'more' } } },
])('blocks mismatched or duplicate-prone recovery before writes (%j)', async changes => {
  const fetcher = verificationFetch(changes);
  await expect(verifyRecovery(config, settings, saved(), fetcher)).rejects.toThrow();
  expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});

it('creates only the missing creative and paused ad, preserving the original campaign and ad set', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({ id: '30' })).mockResolvedValueOnce(response({ id: '40' }))
    .mockResolvedValueOnce(response({ id: '10', status: 'PAUSED' })).mockResolvedValueOnce(response({ id: '20', status: 'PAUSED' }))
    .mockResolvedValueOnce(response({ id: '40', status: 'PAUSED' }));
  const checkpoint = vi.fn().mockResolvedValue(undefined);
  await completePausedAd(config, settings, plan, '10', '20', checkpoint, fetcher);
  expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST').map(([url]) => new URL(url).pathname))
    .toEqual(['/v27.0/act_123/adcreatives', '/v27.0/act_123/ads']);
  const creative = JSON.parse(fetcher.mock.calls[0][1].body.get('object_story_spec'));
  expect(creative.link_data).toMatchObject({ message: 'Saved copy', name: 'Saved headline', picture: product.image_url, link: plan.destination });
  expect(fetcher.mock.calls[1][1].body.get('adset_id')).toBe('20');
  expect(fetcher.mock.calls[1][1].body.get('status')).toBe('PAUSED');
  expect(checkpoint.mock.calls).toEqual([[{ creative_id: '30' }], [{ ad_id: '40' }]]);
});

it('does not retry after an uncertain creative response or a lost checkpoint', async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error('secret-fixture'));
  const checkpoint = vi.fn();
  await expect(completePausedAd(config, settings, plan, '10', '20', checkpoint, fetcher)).rejects.toThrow('Meta connection failed');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(checkpoint).not.toHaveBeenCalled();
  fetcher.mockReset().mockResolvedValueOnce(response({ id: '30' }));
  checkpoint.mockRejectedValueOnce(new Error('Checkpoint failed'));
  await expect(completePausedAd(config, settings, plan, '10', '20', checkpoint, fetcher)).rejects.toThrow('Checkpoint failed');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('identifies mismatched fields without exposing provider values, names or arbitrary targeting keys', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const fetcher = verificationFetch({ adset: {
    ...adset, lifetime_budget: '999999', name: 'private-provider-name',
    targeting: { ...adset.targeting, brand_safety_content_filter_levels: ['private-value'], 'secret-fixture': 'private-value' },
  } });
  const failure = verifyRecovery(config, settings, saved(), fetcher);
  await expect(failure).rejects.toThrow('name, lifetime budget, additional targeting fields');
  await expect(failure).rejects.toThrow('Additional fields: brand_safety_content_filter_levels');
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/999999|private-provider-name|private-value|secret-fixture/);
  expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});

it.each([
  [{ countries: ['IN'], location_types: ['home'] }, 'Meta location types differ: home.'],
  [{ countries: ['IN'], location_types: ['all', 'home', 'recent'] }, 'Meta location types differ: all, home, recent.'],
  [{ countries: ['IN'], location_types: ['home', 'frequently_in'] }, 'Meta location types differ: home, frequently_in.'],
  [{ countries: ['IN'], location_types: ['home', 'recent', 'frequently_in', 'travel_in'] }, 'Meta location types differ: home, recent, frequently_in, travel_in.'],
  [{ countries: ['IN'], location_types: ['home', 'recent', 'frequently_in', 'frequently_in'] }, 'Meta location types differ: home, recent, frequently_in, frequently_in.'],
  [{ countries: ['private-country'], location_types: ['frequently_in', 'home', 'recent'] }, 'countries (Meta 1, saved 1)'],
  [{ countries: ['IN'], location_types: [null, 'home', 'recent'] }, 'Meta location types differ: null, home, recent.'],
  [{ countries: ['IN'], location_types: ['', 'home', 'recent'] }, 'Meta location types differ: empty-string, home, recent.'],
  [{ countries: ['IN'], location_types: [' \t\n', 'home', 'recent'] }, 'Meta location types differ: whitespace-only, home, recent.'],
  [{ countries: ['IN'], location_types: ['future_presence', 'home', 'recent'] }, 'Meta location types differ: unsupported-code(future_presence), home, recent.'],
  [{ countries: ['IN'], location_types: ['private-value', 'home', 'recent'] }, 'Meta location types differ: unrecognized-string, home, recent.'],
  [{ countries: ['IN'], location_types: ['a'.repeat(33), 'home', 'recent'] }, 'Meta location types differ: unrecognized-string, home, recent.'],
  [{ countries: ['IN'], cities: [] }, 'cities (Meta 0, saved absent)'],
  [{ countries: ['IN'], country_groups: [] }, 'country_groups (empty list)'],
  [{ countries: ['private-country'] }, 'countries (Meta 1, saved 1)'],
  [{ countries: ['IN'], 'secret-fixture': 'private-value' }, 'unrecognized (non-list value)'],
])('diagnoses geographic mismatch shapes without exposing geographic keys (%j)', async (geo, detail) => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const fetcher = verificationFetch({ adset: { ...adset, targeting: { ...adset.targeting, geo_locations: geo } } });
  const failure = verifyRecovery(config, settings, saved(), fetcher);
  await expect(failure).rejects.toThrow(detail);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret-fixture|private-country|private-value|a{33}/);
  expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});
