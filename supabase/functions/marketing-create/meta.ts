import { searchMetaLocations, type MetaConfig, type MetaLocation } from '../marketing-read/meta.ts';
import { formatMetaCreationError } from '../_shared/metaErrors.ts';
import { isMetaFeedPlacement, usesInstagram, type MetaFeedPlacement } from '../_shared/metaPlacements.ts';

type Fetcher = typeof fetch;
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const numericId = (value: unknown): value is string => typeof value === 'string' && /^\d{1,30}$/.test(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export interface CreationInput {
  draftId: string;
  productId: string;
  primaryTextIndex: number;
  headlineIndex: number;
  startTime: string;
  locations: MetaLocation[] | null;
  placement?: MetaFeedPlacement;
  instagramUserId?: string;
}

export function parseCreationInput(value: unknown): CreationInput {
  if (!isRecord(value) || value.action !== 'create' || value.confirmPaused !== true
    || Object.keys(value).some(key => ![
      'action', 'confirmPaused', 'draftId', 'productId', 'primaryTextIndex', 'headlineIndex', 'startTime', 'locations',
      'placement', 'instagramUserId',
    ].includes(key))
    || (value.placement !== undefined && !isMetaFeedPlacement(value.placement))
    || (value.placement !== 'instagram-feed' && value.placement !== 'facebook-instagram-feeds' && value.instagramUserId !== undefined)
    || !text(value.draftId, 36) || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.draftId)
    || !text(value.productId, 36) || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.productId)
    || (value.primaryTextIndex !== 0 && value.primaryTextIndex !== 1)
    || (value.headlineIndex !== 0 && value.headlineIndex !== 1)
    || typeof value.startTime !== 'string' || value.startTime.length > 40
    || !Number.isFinite(Date.parse(value.startTime))
    || (value.locations !== null && (!Array.isArray(value.locations)
      || value.locations.length < 1 || value.locations.length > 5))) {
    throw new Error('Confirm paused creation with a saved draft, product image, copy, start time and target locations.');
  }
  const locations: MetaLocation[] | null = value.locations === null ? null : [];
  const instagram: Pick<CreationInput, 'placement' | 'instagramUserId'> = {};
  if (value.placement === 'instagram-feed' || value.placement === 'facebook-instagram-feeds') {
    if (!numericId(value.instagramUserId)) throw new Error('Verify the Instagram identity before confirming paused creation.');
    instagram.placement = value.placement;
    instagram.instagramUserId = value.instagramUserId;
  }
  if (Array.isArray(value.locations) && locations) {
    for (const item of value.locations) {
      if (!isRecord(item) || !text(item.key, 100) || !text(item.label, 250)
        || (item.type !== 'region' && item.type !== 'city' && item.type !== 'zip')
        || locations.some(location => location.key === item.key && location.type === item.type)) {
        throw new Error('Select unique Indian locations returned by Meta.');
      }
      locations.push({ key: item.key, label: item.label, type: item.type });
    }
  }
  return {
    draftId: value.draftId, productId: value.productId,
    primaryTextIndex: value.primaryTextIndex, headlineIndex: value.headlineIndex,
    startTime: new Date(value.startTime).toISOString(), locations,
    ...instagram,
  };
}

export function creationSettings(env: (name: string) => string | undefined) {
  if (env('META_PAUSED_CREATION_ENABLED') !== 'true') throw new Error('Paused Meta creation is disabled. Contact the site operator.');
  const pageId = env('META_PAGE_ID')?.trim();
  const pixelId = env('META_PIXEL_ID')?.trim();
  if (!numericId(pageId) || (pixelId !== undefined && !numericId(pixelId))) {
    throw new Error('Meta Page or pixel configuration is invalid.');
  }
  return { pageId, pixelId };
}

export interface CreationPlan {
  campaignName: string;
  goal: 'sales' | 'traffic' | 'awareness';
  destination: string;
  primaryText: string;
  headline: string;
  description: string;
  callToAction: 'SHOP_NOW' | 'LEARN_MORE';
  imageUrl: string;
  startTime: string;
  endTime: string;
  lifetimeBudget: number;
  placement?: Exclude<MetaFeedPlacement, 'facebook-feed'>;
  instagramUserId?: string;
}

export function buildPlan(
  draft: unknown, product: unknown, input: CreationInput, pixelId: string | undefined, now = Date.now(),
  schedule: 'new' | 'existing' = 'new',
): CreationPlan {
  if (!isRecord(draft) || draft.status !== 'approved' || !isRecord(draft.proposal)) {
    throw new Error('Only an internally approved saved proposal can be sent to Meta.');
  }
  const p = draft.proposal;
  if (!text(p.campaignName, 80) || !['sales', 'traffic', 'awareness'].includes(String(p.goal))
    || !Array.isArray(p.primaryText) || p.primaryText.length !== 2 || !p.primaryText.every(item => text(item, 500))
    || !Array.isArray(p.headlines) || p.headlines.length !== 2 || !p.headlines.every(item => text(item, 60))
    || !text(p.description, 120) || typeof p.landingPageUrl !== 'string'
    || !Number.isSafeInteger(p.dailyBudgetInr) || typeof p.dailyBudgetInr !== 'number'
    || p.dailyBudgetInr < 100 || p.dailyBudgetInr > 100_000
    || !Number.isSafeInteger(p.durationDays) || typeof p.durationDays !== 'number'
    || p.durationDays < 1 || p.durationDays > 30
    || p.totalBudgetInr !== p.dailyBudgetInr * p.durationDays) {
    throw new Error('The saved proposal is invalid. Generate and approve a corrected proposal.');
  }
  if (p.callToAction !== 'Shop now' && p.callToAction !== 'Learn more') {
    throw new Error('This release supports website ads with Shop now or Learn more, not messaging ads.');
  }
  if (p.goal === 'sales' && !pixelId) throw new Error('Sales creation requires a configured Meta pixel with a Purchase event.');
  let destination: URL;
  try { destination = new URL(p.landingPageUrl); } catch { throw new Error('Invalid saved destination.'); }
  if (destination.protocol !== 'https:' || destination.username || destination.password || destination.port
    || !['luviacreations.com', 'www.luviacreations.com'].includes(destination.hostname)) {
    throw new Error('Only HTTPS Luvia destinations are supported.');
  }
  if (!isRecord(product) || product.published !== true || typeof product.image_url !== 'string') {
    throw new Error('Select a currently published admin product with an image.');
  }
  let image: URL;
  try { image = new URL(product.image_url, 'https://luviacreations.com'); } catch { throw new Error('Invalid product image URL.'); }
  if (image.protocol !== 'https:' || image.username || image.password || image.port || image.href.length > 2048) {
    throw new Error('The published product image must have a public HTTPS URL.');
  }
  const start = Date.parse(input.startTime);
  const end = start + p.durationDays * 86400_000;
  if (schedule === 'new' && (start < now + 5 * 60_000 || start > now + 30 * 86400_000)) {
    throw new Error('Choose a start time between five minutes and 30 days from now.');
  }
  if (schedule === 'existing' && end <= now) {
    throw new Error('The saved ad-set schedule has ended. Recovery cannot reschedule it; inspect Ads Manager manually.');
  }
  return {
    campaignName: p.campaignName, goal: p.goal as CreationPlan['goal'],
    destination: destination.href,
    primaryText: p.primaryText[input.primaryTextIndex], headline: p.headlines[input.headlineIndex],
    description: p.description, callToAction: p.callToAction === 'Shop now' ? 'SHOP_NOW' : 'LEARN_MORE',
    imageUrl: image.href, startTime: input.startTime,
    endTime: new Date(end).toISOString(),
    lifetimeBudget: p.totalBudgetInr * 100,
    ...(input.placement === 'instagram-feed' || input.placement === 'facebook-instagram-feeds'
      ? { placement: input.placement, instagramUserId: input.instagramUserId } : {}),
  };
}

export async function graph(
  config: MetaConfig, path: string, method: 'GET' | 'POST', parameters: Record<string, string>, fetcher: Fetcher,
  operation: 'permission check' | 'ad account lookup' | 'Facebook Page lookup' | 'Instagram account lookup' | 'pixel lookup' | 'object request' = 'object request',
) {
  const url = new URL(`https://graph.facebook.com/${config.graphApiVersion}/${path}`);
  if (method === 'GET') url.search = new URLSearchParams(parameters).toString();
  let response: Response;
  try {
    response = await fetcher(url, {
      method, headers: { Authorization: `Bearer ${config.accessToken}` },
      ...(method === 'POST' ? { body: new URLSearchParams(parameters) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('Meta connection failed. A write may have completed; inspect Ads Manager before recovery.');
  }
  let payload: unknown;
  try { payload = await response.json(); } catch {
    if (response.ok) throw new Error('Meta returned invalid JSON; inspect Ads Manager before recovery.');
  }
  if (!response.ok || (isRecord(payload) && payload.error)) {
    const details = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
    const code = typeof details.code === 'number' && Number.isSafeInteger(details.code) ? details.code : null;
    const subcode = typeof details.error_subcode === 'number' && Number.isSafeInteger(details.error_subcode)
      ? details.error_subcode : null;
    const permissions = ['ads_read', 'ads_management', 'pages_show_list', 'pages_read_engagement', 'pages_manage_ads', 'instagram_basic']
      .filter(permission => typeof details.message === 'string' && details.message.includes(permission));
    console.error('Meta request failed.', { operation, status: response.status, code, subcode, permissions });
    const diagnostic = [`HTTP ${response.status}`, ...(code !== null ? [`code ${code}`] : []),
      ...(subcode !== null ? [`subcode ${subcode}`] : [])].join(', ');
    const recovery = code === 190 ? 'Reconnect Meta; its access token is invalid or expired.'
      : operation === 'Facebook Page lookup' ? 'Verify META_PAGE_ID, Page access for the connected login and the business login permissions, then reconnect Meta.'
        : operation === 'Instagram account lookup' ? 'Verify the Page-linked Instagram professional account, its ad-account assignment and granted permissions; reconnect Meta if access changed.'
        : operation === 'ad account lookup' ? 'Verify the configured ad account and access for the connected login.'
          : 'Check permissions and account setup in Meta.';
    throw new Error(formatMetaCreationError(`Meta ${operation} failed (${diagnostic}). ${recovery}${permissions.length
      ? ` Meta mentions: ${permissions.join(', ')}.` : ''}`));
  }
  if (!isRecord(payload)) throw new Error('Meta returned an invalid response; inspect Ads Manager before recovery.');
  return payload;
}

export async function preflight(
  config: MetaConfig, settings: ReturnType<typeof creationSettings>, sales: boolean, fetcher: Fetcher = fetch,
  placement: CreationInput['placement'] = 'facebook-feed',
) {
  const permissions = await graph(config, 'me/permissions', 'GET', {}, fetcher, 'permission check');
  const required = ['ads_management', ...(usesInstagram(placement) ? ['instagram_basic', 'pages_show_list'] : [])];
  const missing = required.filter(permission => !Array.isArray(permissions.data) || !permissions.data.some(item =>
    isRecord(item) && item.permission === permission && item.status === 'granted'));
  if (missing.length) {
    throw new Error(`Reconnect Meta with ${missing.join(', ')} granted in the approved business login configuration.`);
  }
  const account = await graph(config, `act_${config.accountId}`, 'GET', { fields: 'id,name,currency,account_status' }, fetcher, 'ad account lookup');
  if (account.id !== `act_${config.accountId}` || !text(account.name, 250)
    || account.currency !== 'INR' || account.account_status !== 1) {
    throw new Error('Paused creation requires the configured active INR ad account.');
  }
  const page = await graph(config, settings.pageId, 'GET', { fields: 'id,name' }, fetcher, 'Facebook Page lookup');
  if (page.id !== settings.pageId || !text(page.name, 250)) throw new Error('Unable to verify the configured Facebook Page.');
  if (sales) {
    if (!settings.pixelId) throw new Error('Sales creation requires a configured Meta pixel with a Purchase event.');
    const pixel = await graph(config, settings.pixelId, 'GET', { fields: 'id' }, fetcher, 'pixel lookup');
    if (pixel.id !== settings.pixelId) throw new Error('Unable to verify the configured Meta pixel.');
  }
  return { accountId: config.accountId, accountName: account.name, pageId: settings.pageId, pageName: page.name };
}

export async function resolveLocations(config: MetaConfig, locations: MetaLocation[] | null, fetcher: Fetcher = fetch) {
  if (locations === null) return { countries: ['IN'] };
  const geo: Record<string, { key: string }[]> = {};
  for (const location of locations) {
    const matches = await searchMetaLocations(config, location.label.split(',')[0].slice(0, 100), location.type, fetcher);
    if (!matches.some(item => item.key === location.key)) throw new Error('A location could not be verified in India. Search and select it again.');
    const field = location.type === 'region' ? 'regions' : location.type === 'city' ? 'cities' : 'zips';
    (geo[field] ??= []).push({ key: location.key });
  }
  return geo;
}

export async function listMetaObjects(
  config: MetaConfig, path: string, fields: string, inspect: (item: Record<string, unknown>) => void,
  fetcher: Fetcher, operation: 'object request' | 'Instagram account lookup' = 'object request',
) {
  let after = '';
  const cursors = new Set<string>();
  for (let page = 0; page < 10; page++) {
    const result = await graph(config, path, 'GET', { fields, limit: '100', ...(after ? { after } : {}) }, fetcher, operation);
    if (!Array.isArray(result.data)) throw new Error('Unable to verify existing Meta objects. No new writes were sent.');
    for (const item of result.data) {
      if (!isRecord(item) || !numericId(item.id)) throw new Error('Invalid Meta object listing. No new writes were sent.');
      inspect(item);
    }
    if (result.paging === undefined) {
      if (result.data.length >= 100) throw new Error('Meta listing may be incomplete. No new writes were sent.');
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
  throw new Error('Meta object listing exceeds the verification safety limit. Inspect Ads Manager manually.');
}

export async function instagramIdentity(
  config: MetaConfig, settings: ReturnType<typeof creationSettings>, expectedId?: string, fetcher: Fetcher = fetch,
) {
  const page = await graph(config, settings.pageId, 'GET', {
    fields: 'id,instagram_business_account{id,username}',
  }, fetcher, 'Instagram account lookup');
  const account = page.instagram_business_account;
  if (page.id !== settings.pageId || !isRecord(account) || !numericId(account.id)
    || typeof account.username !== 'string' || !/^[a-zA-Z0-9._]{1,30}$/.test(account.username)) {
    throw new Error('No verified Instagram professional account is linked to the configured Page. Check its connection and permissions in Meta.');
  }
  if (expectedId !== undefined && account.id !== expectedId) {
    throw new Error('The linked Instagram identity changed. Check the connection again before confirming creation.');
  }
  let matches = 0;
  await listMetaObjects(config, `act_${config.accountId}/instagram_accounts`, 'id', item => {
    if (item.id === account.id) matches++;
  }, fetcher, 'Instagram account lookup');
  if (matches !== 1) throw new Error('The linked Instagram account is not uniquely authorized for the configured ad account. Check its asset assignment in Meta.');
  return { id: account.id, username: account.username };
}

function objectWriter(
  config: MetaConfig, checkpoint: (ids: Record<string, string>) => Promise<unknown>, fetcher: Fetcher,
) {
  return async (edge: string, parameters: Record<string, string>, field: string) => {
    const result = await graph(config, `act_${config.accountId}/${edge}`, 'POST', parameters, fetcher);
    if (!numericId(result.id)) throw new Error('Meta returned an invalid object ID; inspect Ads Manager before recovery.');
    await checkpoint({ [field]: result.id });
    return result.id;
  };
}

export async function createPausedObjects(
  config: MetaConfig, settings: ReturnType<typeof creationSettings>, plan: CreationPlan,
  geo: Awaited<ReturnType<typeof resolveLocations>>,
  checkpoint: (ids: Record<string, string>) => Promise<unknown>, fetcher: Fetcher = fetch,
) {
  if (usesInstagram(plan.placement) && !numericId(plan.instagramUserId)) {
    throw new Error('Verify the Instagram identity before creating paused objects.');
  }
  const post = objectWriter(config, checkpoint, fetcher);
  const campaignId = await post('campaigns', {
    name: plan.campaignName,
    objective: plan.goal === 'sales' ? 'OUTCOME_SALES' : plan.goal === 'traffic' ? 'OUTCOME_TRAFFIC' : 'OUTCOME_AWARENESS',
    special_ad_categories: '[]', status: 'PAUSED', buying_type: 'AUCTION', is_adset_budget_sharing_enabled: 'false',
  }, 'campaign_id');
  const adsetId = await post('adsets', {
    name: `${plan.campaignName} - ${plan.placement === 'facebook-instagram-feeds'
      ? 'Facebook + Instagram Feeds' : `${plan.placement === 'instagram-feed' ? 'Instagram' : 'Facebook'} Feed`}`,
    campaign_id: campaignId, status: 'PAUSED',
    lifetime_budget: String(plan.lifetimeBudget), start_time: plan.startTime, end_time: plan.endTime,
    billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    optimization_goal: plan.goal === 'sales' ? 'OFFSITE_CONVERSIONS' : plan.goal === 'traffic' ? 'LINK_CLICKS' : 'REACH',
    ...(plan.goal === 'sales' ? { promoted_object: JSON.stringify({ pixel_id: settings.pixelId, custom_event_type: 'PURCHASE' }) }
      : plan.goal === 'awareness' ? { promoted_object: JSON.stringify({ page_id: settings.pageId }) } : {}),
    ...(plan.goal !== 'awareness' ? { destination_type: 'WEBSITE' } : {}),
    targeting: JSON.stringify({
      geo_locations: geo, age_min: 18,
      publisher_platforms: plan.placement === 'facebook-instagram-feeds'
        ? ['facebook', 'instagram'] : plan.placement === 'instagram-feed' ? ['instagram'] : ['facebook'],
      ...(plan.placement !== 'instagram-feed' ? { facebook_positions: ['feed'] } : {}),
      ...(usesInstagram(plan.placement) ? { instagram_positions: ['stream'] } : {}),
      targeting_automation: { advantage_audience: 0 },
    }),
  }, 'adset_id');
  await completePausedAd(config, settings, plan, campaignId, adsetId, checkpoint, fetcher);
}

export async function completePausedAd(
  config: MetaConfig, settings: ReturnType<typeof creationSettings>, plan: CreationPlan,
  campaignId: string, adsetId: string, checkpoint: (ids: Record<string, string>) => Promise<unknown>,
  fetcher: Fetcher = fetch,
) {
  if (usesInstagram(plan.placement) && !numericId(plan.instagramUserId)) {
    throw new Error('Verify the Instagram identity before creating the creative.');
  }
  const post = objectWriter(config, checkpoint, fetcher);
  const creativeId = await post('adcreatives', {
    name: plan.campaignName,
    object_story_spec: JSON.stringify({
      page_id: settings.pageId,
      ...(usesInstagram(plan.placement) ? { instagram_user_id: plan.instagramUserId } : {}),
      link_data: {
        link: plan.destination, picture: plan.imageUrl, message: plan.primaryText,
        name: plan.headline, description: plan.description,
        call_to_action: { type: plan.callToAction, value: { link: plan.destination } },
      },
    }),
  }, 'creative_id');
  const adId = await post('ads', {
    name: plan.campaignName, adset_id: adsetId, creative: JSON.stringify({ creative_id: creativeId }), status: 'PAUSED',
  }, 'ad_id');
  for (const id of [campaignId, adsetId, adId]) {
    const result = await graph(config, id, 'GET', { fields: 'id,status' }, fetcher);
    if (result.id !== id || result.status !== 'PAUSED') throw new Error('Meta did not confirm PAUSED status. Inspect the new objects in Ads Manager.');
  }
}
