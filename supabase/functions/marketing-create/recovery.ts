import { buildPlan, graph, isRecord, parseCreationInput, preflight, resolveLocations } from './meta.ts';
import type { CreationPlan, creationSettings } from './meta.ts';
import type { MetaConfig } from '../marketing-read/meta.ts';

const rejectedCreative = 'Meta object request failed (HTTP 400, code 100, subcode 1885183). Check permissions and account setup in Meta.';
const id = (value: unknown): value is string => typeof value === 'string' && /^\d{1,30}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

export function parseRecoveryInput(value: unknown) {
  if (!isRecord(value) || !uuid(value.draftId)
    || (value.action !== 'review-recovery' && value.action !== 'recover')
    || Object.keys(value).some(key => !['action', 'draftId', 'confirmPaused', 'confirmNoManualAd'].includes(key))
    || (value.action === 'review-recovery' && Object.keys(value).length !== 2)
    || (value.action === 'recover' && (value.confirmPaused !== true || value.confirmNoManualAd !== true))) {
    throw new Error('Review the saved recovery and confirm paused creation after discarding manual ad drafts.');
  }
  return { draftId: value.draftId, action: value.action };
}

export function recoverySnapshot(
  value: unknown, draft: unknown, product: unknown, config: MetaConfig,
  settings: ReturnType<typeof creationSettings>, now = Date.now(),
) {
  if (!isRecord(value) || value.status !== 'needs_attention' || value.error !== rejectedCreative
    || value.recovery_started_at !== null || !id(value.campaign_id) || !id(value.adset_id)
    || value.creative_id !== null || value.ad_id !== null || value.account_id !== config.accountId
    || !isRecord(value.request) || value.request.pageId !== settings.pageId
    || value.request.pixelId !== (settings.pixelId ?? null)) {
    throw new Error('This attempt is not eligible for automatic recovery. Inspect Ads Manager; do not retry or replace the proposal.');
  }
  const saved = value.request;
  const input = parseCreationInput({
    action: 'create', confirmPaused: true, draftId: saved.draftId, productId: saved.productId,
    primaryTextIndex: saved.primaryTextIndex, headlineIndex: saved.headlineIndex,
    startTime: saved.startTime, locations: saved.locations,
  });
  const plan = buildPlan(draft, product, input, settings.pixelId, now, 'existing');
  const savedPlan = saved.plan;
  if (input.draftId !== value.draft_id || plan.goal !== 'traffic' || !isRecord(savedPlan)
    || Object.keys(plan).some(key => plan[key as keyof CreationPlan] !== savedPlan[key])) {
    throw new Error('The saved traffic-ad details changed or are invalid. Recovery cannot change the approved request.');
  }
  return { input, plan, campaignId: value.campaign_id, adsetId: value.adset_id, geo: saved.geo };
}

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return JSON.stringify(value.map(canonical).sort());
  if (isRecord(value)) return JSON.stringify(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return JSON.stringify(value);
};

function sameGeo(actual: unknown, expected: unknown) {
  if (!isRecord(actual) || !isRecord(expected)) return { matches: false, detail: 'Missing or malformed geographic targeting.' };
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(actual)) {
    if (key === 'location_types') {
      if (canonical(value) !== canonical(['home', 'recent'])) {
        const types = Array.isArray(value) ? value.map(item =>
          typeof item === 'string' && ['home', 'recent', 'travel_in', 'all', 'unknown', 'none'].includes(item)
            ? item : item === null ? 'null' : typeof item !== 'string' ? 'non-string' : 'unrecognized') : ['malformed'];
        return { matches: false, detail: `Meta location types differ: ${types.slice(0, 5).join(', ') || 'empty'}.` };
      }
    } else if (['countries', 'regions', 'cities', 'zips'].includes(key) && Array.isArray(value)) {
      if (key !== 'countries' && value.some(item => !isRecord(item)
        || Object.keys(item).some(field => field !== 'key' && field !== 'name' && field !== 'country' && field !== 'region'))) {
        return { matches: false, detail: `Unexpected ${key} selection metadata.` };
      }
      normalized[key] = key === 'countries' ? value : value.map(item => isRecord(item) ? { key: item.key } : null);
    } else {
      const field = ['countries', 'regions', 'cities', 'zips', 'country_groups', 'custom_locations', 'geo_markets', 'places']
        .includes(key) ? key : 'unrecognized';
      return { matches: false, detail: `Unexpected geography field: ${field} (${Array.isArray(value)
        ? value.length === 0 ? 'empty list' : 'non-empty list' : 'non-list value'}).` };
    }
  }
  const mismatches = ['countries', 'regions', 'cities', 'zips']
    .filter(field => canonical(normalized[field]) !== canonical(expected[field]));
  return { matches: mismatches.length === 0, detail: mismatches.length
    ? `Geographic selections differ: ${mismatches.map(field => `${field} (Meta ${Array.isArray(normalized[field])
      ? normalized[field].length : 'absent'}, saved ${Array.isArray(expected[field]) ? expected[field].length : 'absent'})`).join(', ')}.`
    : '' };
}

async function listObjects(
  config: MetaConfig, path: string, fields: string, inspect: (item: Record<string, unknown>) => void,
  fetcher: typeof fetch,
) {
  let after = '';
  const cursors = new Set<string>();
  for (let page = 0; page < 10; page++) {
    const result = await graph(config, path, 'GET', { fields, limit: '100', ...(after ? { after } : {}) }, fetcher);
    if (!Array.isArray(result.data)) throw new Error('Unable to verify existing Meta objects. Recovery is blocked.');
    for (const item of result.data) {
      if (!isRecord(item) || !id(item.id)) throw new Error('Invalid Meta object listing. Recovery is blocked.');
      inspect(item);
    }
    if (result.paging === undefined) {
      if (result.data.length >= 100) throw new Error('Meta listing may be incomplete. Recovery is blocked.');
      return;
    }
    if (!isRecord(result.paging)) throw new Error('Unable to verify complete Meta object listing.');
    if (!result.paging.next) return;
    if (!isRecord(result.paging.cursors) || typeof result.paging.cursors.after !== 'string'
      || !result.paging.cursors.after || cursors.has(result.paging.cursors.after)) {
      throw new Error('Unable to verify complete Meta object listing.');
    }
    after = result.paging.cursors.after;
    cursors.add(after);
  }
  throw new Error('Meta object listing exceeds the recovery safety limit. Inspect Ads Manager manually.');
}

export async function verifyRecovery(
  config: MetaConfig, settings: ReturnType<typeof creationSettings>, saved: ReturnType<typeof recoverySnapshot>,
  fetcher: typeof fetch = fetch,
) {
  const { plan, campaignId, adsetId } = saved;
  await preflight(config, settings, false, fetcher);
  const geo = await resolveLocations(config, saved.input.locations, fetcher);
  if (canonical(geo) !== canonical(saved.geo)) throw new Error('Saved targeting changed. Recovery is blocked.');
  const campaign = await graph(config, campaignId, 'GET', {
    fields: 'id,account_id,name,status,objective,buying_type,special_ad_categories',
  }, fetcher);
  if (campaign.id !== campaignId || campaign.account_id !== config.accountId || campaign.status !== 'PAUSED'
    || campaign.name !== plan.campaignName || campaign.objective !== 'OUTCOME_TRAFFIC'
    || campaign.buying_type !== 'AUCTION' || !Array.isArray(campaign.special_ad_categories)
    || campaign.special_ad_categories.length !== 0) {
    throw new Error('The existing campaign is not paused or no longer matches the saved request. Recovery is blocked.');
  }
  const adset = await graph(config, adsetId, 'GET', {
    fields: 'id,account_id,campaign_id,name,status,lifetime_budget,daily_budget,start_time,end_time,billing_event,bid_strategy,optimization_goal,destination_type,promoted_object,targeting',
  }, fetcher);
  const targeting = adset.targeting;
  const geography = sameGeo(isRecord(targeting) ? targeting.geo_locations : undefined, geo);
  const checks = {
    'object/account/campaign identity': adset.id === adsetId && adset.account_id === config.accountId && adset.campaign_id === campaignId,
    'paused status': adset.status === 'PAUSED',
    name: adset.name === `${plan.campaignName} - Facebook Feed`,
    'lifetime budget': adset.lifetime_budget === String(plan.lifetimeBudget),
    'daily budget': adset.daily_budget === undefined || adset.daily_budget === '0',
    'start time': typeof adset.start_time === 'string' && Date.parse(adset.start_time) === Date.parse(plan.startTime),
    'end time': typeof adset.end_time === 'string' && Date.parse(adset.end_time) === Date.parse(plan.endTime),
    'billing event': adset.billing_event === 'IMPRESSIONS',
    'bid strategy': adset.bid_strategy === 'LOWEST_COST_WITHOUT_CAP',
    'optimization goal': adset.optimization_goal === 'LINK_CLICKS',
    'destination type': adset.destination_type === 'WEBSITE',
    'promoted object': adset.promoted_object === undefined || (isRecord(adset.promoted_object) && Object.keys(adset.promoted_object).length === 0),
    'age limits': isRecord(targeting) && targeting.age_min === 18 && (targeting.age_max === undefined || targeting.age_max === 65),
    platforms: isRecord(targeting) && canonical(targeting.publisher_platforms) === canonical(['facebook']),
    positions: isRecord(targeting) && canonical(targeting.facebook_positions) === canonical(['feed']),
    geography: geography.matches,
    'audience automation': isRecord(targeting) && isRecord(targeting.targeting_automation)
      && targeting.targeting_automation.advantage_audience === 0
      && Object.keys(targeting.targeting_automation).every(key => key === 'advantage_audience'),
    'additional targeting fields': isRecord(targeting) && Object.keys(targeting).every(key => [
      'age_min', 'age_max', 'publisher_platforms', 'facebook_positions', 'geo_locations', 'targeting_automation',
    ].includes(key)),
  };
  const mismatches = Object.entries(checks).filter(([, matches]) => !matches).map(([field]) => field);
  if (mismatches.length) {
    const additionalFields = isRecord(targeting) ? [
      'brand_safety_content_filter_levels', 'device_platforms', 'genders', 'flexible_spec',
      'excluded_geo_locations', 'targeting_relaxation_types',
    ].filter(field => field in targeting) : [];
    console.error('Meta recovery ad-set verification failed.', { mismatches, additionalFields, geography: geography.detail });
    throw new Error(`Existing ad-set verification failed: ${mismatches.join(', ')}.${additionalFields.length
      ? ` Additional fields: ${additionalFields.join(', ')}.` : ''}${!geography.matches
        ? ` ${geography.detail}` : ''} Recovery is blocked; no recovery writes were sent.`);
  }
  const adsets: string[] = [];
  await listObjects(config, `${campaignId}/adsets`, 'id', item => { adsets.push(String(item.id)); }, fetcher);
  if (adsets.length !== 1 || adsets[0] !== adsetId) throw new Error('Unexpected ad sets exist. Inspect Ads Manager before recovery.');
  await listObjects(config, `${campaignId}/ads`, 'id', () => {
    throw new Error('An ad already exists in this campaign. Recovery will not create a duplicate.');
  }, fetcher);
  await listObjects(config, `act_${config.accountId}/adcreatives`, 'id,name', item => {
    if (typeof item.name !== 'string' || item.name === plan.campaignName) {
      throw new Error('An existing or unidentifiable creative may belong to this attempt. Inspect Ads Manager before recovery.');
    }
  }, fetcher);
}
