import type { MetaConfig } from '../marketing-read/meta.ts';
import {
  normalizeInstagramMedia, type InstagramFeedPost,
} from '../_shared/instagramFeed.ts';

type JsonRecord = Record<string, unknown>;
type Fetcher = typeof fetch;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

async function graphGet(
  config: MetaConfig, path: string, parameters: Record<string, string>, fetcher: Fetcher,
): Promise<JsonRecord> {
  const url = new URL(`https://graph.facebook.com/${config.graphApiVersion}/${path}`);
  url.search = new URLSearchParams(parameters).toString();
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('Unable to connect to Meta for the Instagram feed.');
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Meta returned an invalid Instagram feed response.');
  }
  if (!response.ok || !isRecord(payload) || 'error' in payload) {
    const details = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
    console.error('Instagram feed Meta request failed.', {
      path, status: response.status,
      code: typeof details.code === 'number' ? details.code : undefined,
    });
    throw new Error('Meta could not provide Instagram feed data. Check account permissions and reconnect Meta if needed.');
  }
  return payload;
}

function requirePermissions(value: unknown) {
  const grants = ['instagram_basic', 'pages_show_list', 'pages_read_engagement'];
  const data = isRecord(value) && Array.isArray(value.data) ? value.data : [];
  const granted = (permission: string) => data.some(item =>
    isRecord(item) && item.permission === permission && item.status === 'granted');
  const missing = grants.filter(permission => !data.some(item =>
    isRecord(item) && item.permission === permission && item.status === 'granted'));
  if (missing.length) throw new Error(`Reconnect Meta with ${missing.join(', ')} granted for the Instagram feed.`);
  return granted('instagram_manage_insights');
}

function viewsCount(value: unknown): number | undefined {
  if (!isRecord(value) || !Array.isArray(value.data)) return undefined;
  const metric = value.data.find(item => isRecord(item) && item.name === 'views');
  if (!isRecord(metric)) return undefined;
  const total = isRecord(metric.total_value) ? metric.total_value.value : undefined;
  if (typeof total === 'number' && Number.isSafeInteger(total) && total >= 0) return total;
  if (!Array.isArray(metric.values)) return undefined;
  const row = metric.values.find(item =>
    isRecord(item) && typeof item.value === 'number' && Number.isSafeInteger(item.value) && item.value >= 0);
  return isRecord(row) && typeof row.value === 'number' ? row.value : undefined;
}

async function addViews(
  config: MetaConfig, posts: InstagramFeedPost[], hasInsightsPermission: boolean, fetcher: Fetcher,
): Promise<InstagramFeedPost[]> {
  if (!hasInsightsPermission) {
    console.warn('Instagram insights permission is missing; post view counts are omitted.');
    return posts.map(post => ({ ...post, viewsChecked: true }));
  }
  return Promise.all(posts.map(async post => {
    if (post.mediaType === 'CAROUSEL_ALBUM') return { ...post, viewsChecked: true };
    try {
      const insights = await graphGet(config, `${post.id}/insights`, { metric: 'views' }, fetcher);
      const count = viewsCount(insights);
      return { ...post, viewsChecked: true, ...(count !== undefined ? { viewsCount: count } : {}) };
    } catch {
      console.warn('Instagram view count is unavailable for media.', { mediaId: post.id });
      return { ...post, viewsChecked: true };
    }
  }));
}

export async function fetchInstagramFeed(
  config: MetaConfig, pageId: string, fetcher: Fetcher = fetch, now = Date.now(),
): Promise<{ username: string; posts: InstagramFeedPost[] }> {
  if (!/^\d{1,30}$/.test(pageId)) throw new Error('The Meta publishing Page is not configured.');

  const permissions = await graphGet(config, 'me/permissions', {}, fetcher);
  const hasInsightsPermission = requirePermissions(permissions);

  const page = await graphGet(config, pageId, { fields: 'id,name,access_token' }, fetcher);
  if (page.id !== pageId) throw new Error('Meta did not return the configured Facebook Page.');
  if (typeof page.access_token !== 'string' || !page.access_token.trim()) {
    throw new Error('Meta did not provide a Page access token. Reconnect Meta and select the configured Page.');
  }
  const pageConfig = { ...config, accessToken: page.access_token };
  const identity = await graphGet(pageConfig, pageId, {
    fields: 'id,instagram_business_account{id,username}',
  }, fetcher);
  const account = identity.instagram_business_account;
  if (identity.id !== pageId || !isRecord(account) || typeof account.id !== 'string' || !/^\d{1,30}$/.test(account.id)
    || typeof account.username !== 'string' || !/^[a-zA-Z0-9._]{1,30}$/.test(account.username)) {
    throw new Error('No Instagram professional account is linked to the configured Facebook Page.');
  }

  const media = await graphGet(pageConfig, `${account.id}/media`, {
    fields: 'id,caption,media_type,media_url,permalink,timestamp,thumbnail_url,like_count,children{media_type,media_url,thumbnail_url}',
    limit: '25',
  }, fetcher);
  const posts = normalizeInstagramMedia(media.data, now);
  return { username: account.username, posts: await addViews(config, posts, hasInsightsPermission, fetcher) };
}
