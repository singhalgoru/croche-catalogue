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
  const missing = grants.filter(permission => !data.some(item =>
    isRecord(item) && item.permission === permission && item.status === 'granted'));
  if (missing.length) throw new Error(`Reconnect Meta with ${missing.join(', ')} granted for the Instagram feed.`);
}

export async function fetchInstagramFeed(
  config: MetaConfig, pageId: string, fetcher: Fetcher = fetch, now = Date.now(),
): Promise<{ username: string; posts: InstagramFeedPost[] }> {
  if (!/^\d{1,30}$/.test(pageId)) throw new Error('The Meta publishing Page is not configured.');

  const permissions = await graphGet(config, 'me/permissions', {}, fetcher);
  requirePermissions(permissions);

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
    fields: 'id,caption,media_type,media_url,permalink,timestamp,thumbnail_url,children{media_type,media_url,thumbnail_url}',
    limit: '25',
  }, fetcher);
  return { username: account.username, posts: normalizeInstagramMedia(media.data, now) };
}
