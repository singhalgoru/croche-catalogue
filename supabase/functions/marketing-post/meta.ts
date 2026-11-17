import { graph, listMetaObjects } from '../marketing-create/meta.ts';
import type { MetaConfig } from '../marketing-read/meta.ts';
import {
  socialNumericId, socialPermalink, socialPostImageUrls, socialRecord,
  type SocialPlatform, type SocialPost, type SocialPublishingSetup,
} from '../_shared/socialPosts.ts';

type Fetcher = typeof fetch;
export interface PublishingAccess {
  config: MetaConfig;
  setup: SocialPublishingSetup;
}

export async function publishingAccess(
  config: MetaConfig, pageId: string, platforms: SocialPlatform[], enabled: boolean, fetcher: Fetcher = fetch,
): Promise<PublishingAccess> {
  const permissions = await graph(config, 'me/permissions', 'GET', {}, fetcher, 'organic publishing request');
  const required = ['pages_show_list', 'pages_read_engagement',
    ...(platforms.includes('facebook') ? ['pages_manage_posts'] : []),
    ...(platforms.includes('instagram') ? ['instagram_basic', 'instagram_content_publish'] : [])];
  const missing = required.filter(permission => !Array.isArray(permissions.data) || !permissions.data.some(item =>
    socialRecord(item) && item.permission === permission && item.status === 'granted'));
  if (missing.length) throw new Error(`Reconnect Meta with ${missing.join(', ')} granted in the approved business login configuration.`);
  const pages: Record<string, unknown>[] = [];
  await listMetaObjects(config, 'me/accounts', 'id,name,access_token,tasks', item => {
    if (item.id === pageId) pages.push(item);
  }, fetcher, 'organic publishing request');
  if (pages.length > 1) {
    throw new Error('Meta returned the configured Facebook Page more than once in /me/accounts. Page access could not be verified safely. No publishing request was sent.');
  }
  const page = pages[0] ?? await graph(config, pageId, 'GET', { fields: 'id,name,access_token' }, fetcher, 'organic publishing request');
  if (page.id !== pageId) {
    throw new Error('Meta did not return the configured Facebook Page. Verify the Page ID and access for the connected login. No publishing request was sent.');
  }
  if (typeof page.name !== 'string' || !page.name.trim() || page.name.length > 300) {
    throw new Error('Meta returned the configured Facebook Page without a valid Page name. Reconnect Meta and check Page access. No publishing request was sent.');
  }
  if (typeof page.access_token !== 'string' || !page.access_token.trim()) {
    throw new Error('Meta returned the configured Facebook Page but did not provide its Page access token. Reconnect Meta with the Page selected and the required publishing permissions granted. No publishing request was sent.');
  }
  const pageConfig = { ...config, accessToken: page.access_token };
  if (pages.length) {
    if (!Array.isArray(page.tasks)) {
      throw new Error('Meta returned the configured Facebook Page without a Page task list. Check the connected login in Page settings > Page access, then reconnect Meta. No publishing request was sent.');
    }
    const tasks = page.tasks;
    const publishingTasks = ['CREATE_CONTENT', 'MANAGE', 'PROFILE_PLUS_CREATE_CONTENT', 'PROFILE_PLUS_FULL_CONTROL'];
    if (!tasks.some(task => publishingTasks.includes(String(task)))) {
      const knownTasks = ['ADVERTISE', 'ANALYZE', 'MODERATE', 'MESSAGING', 'MANAGE_LEADS', 'VIEW_MONETIZATION_INSIGHTS',
        'PROFILE_PLUS_ADVERTISE', 'PROFILE_PLUS_ANALYZE', 'PROFILE_PLUS_MODERATE', 'PROFILE_PLUS_MESSAGING']
        .filter(task => tasks.includes(task));
      const otherTasks = tasks.filter(task => !knownTasks.includes(String(task))).length;
      throw new Error(`Meta returned the configured Facebook Page but did not confirm content-creation access (Content or Full control). Recognized tasks: ${knownTasks.join(', ') || 'none'}; unrecognized task entries: ${otherTasks}. Check Page settings > Page access for content-creation access and reconnect Meta. No publishing request was sent.`);
    }
  } else {
    const identity = await graph(pageConfig, 'me', 'GET', { fields: 'id' }, fetcher, 'organic publishing request');
    if (identity.id !== pageId) throw new Error('The Page token did not identify the configured Facebook Page. No publishing request was sent.');
    const settings = await graph(pageConfig, `${pageId}/settings`, 'GET', {}, fetcher, 'organic publishing request');
    if (!Array.isArray(settings.data) || !settings.data.every(socialRecord)) {
      throw new Error('Meta did not verify Page management access. Check Page access and publishing permissions. No publishing request was sent.');
    }
  }
  let instagram: SocialPublishingSetup['instagram'];
  if (platforms.includes('instagram')) {
    const identity = await graph(pageConfig, pageId, 'GET', { fields: 'id,instagram_business_account{id,username}' }, fetcher, 'organic publishing request');
    const account = identity.instagram_business_account;
    if (identity.id !== pageId || !socialRecord(account) || !socialNumericId(account.id) || typeof account.username !== 'string'
      || !/^[a-zA-Z0-9._]{1,30}$/.test(account.username)) {
      throw new Error('No verified Instagram professional account is linked to the publishing Page. Check its Page connection and publishing permissions.');
    }
    instagram = { id: account.id, username: account.username };
  }
  return { config: pageConfig, setup: { enabled, pageId, pageName: page.name, ...(instagram ? { instagram } : {}) } };
}

export function verifyPublishingIdentity(post: SocialPost, access: PublishingAccess) {
  if (post.request.pageId !== access.setup.pageId
    || (post.platform === 'instagram' && post.request.instagramUserId !== access.setup.instagram?.id)) {
    throw new Error('The publishing identity changed. Prepare and review a new draft before publishing; do not retry an attempted post.');
  }
}

export async function readPublishedPost(post: SocialPost, config: MetaConfig, fetcher: Fetcher = fetch) {
  if (!post.post_id) throw new Error('No saved post ID is available. Inspect the destination profile; do not publish again.');
  const result = await graph(config, post.post_id, 'GET', {
    fields: post.platform === 'facebook' ? 'id,permalink_url,is_published,from' : 'id,permalink,media_type',
  }, fetcher, 'organic publishing request');
  const permalink = post.platform === 'facebook' ? result.permalink_url : result.permalink;
  if (result.id !== post.post_id || !socialPermalink(permalink, post.platform)
    || (post.platform === 'facebook' && (result.is_published !== true || !socialRecord(result.from) || result.from.id !== post.request.pageId))
    || (post.platform === 'instagram' && result.media_type !== (socialPostImageUrls(post.request).length > 1 ? 'CAROUSEL_ALBUM' : 'IMAGE'))) {
    throw new Error('Meta did not verify the published image post. Inspect the destination profile; do not publish again.');
  }
  return { status: 'published' as const, permalink, error: null };
}

export async function containerStatus(post: SocialPost, config: MetaConfig, fetcher: Fetcher = fetch) {
  if (!post.container_id) throw new Error('The Instagram container ID is missing. Do not create another container.');
  const result = await graph(config, post.container_id, 'GET', { fields: 'id,status_code' }, fetcher, 'organic publishing request');
  if (result.id !== post.container_id || !['IN_PROGRESS', 'FINISHED', 'PUBLISHED', 'ERROR', 'EXPIRED'].includes(String(result.status_code))) {
    throw new Error('Instagram returned an unknown container status. Inspect the profile; do not create another post.');
  }
  if (result.status_code === 'IN_PROGRESS') return { status: 'processing' as const, error: null };
  if (result.status_code === 'FINISHED') return { status: 'ready' as const, error: null };
  return { status: 'needs_attention' as const, error: result.status_code === 'PUBLISHED'
    ? 'Instagram reports this container was published, but no verified post ID was saved. Inspect the profile; do not publish again.'
    : `Instagram container ${result.status_code === 'EXPIRED' ? 'expired' : 'failed'}. Operator reconciliation is required; do not create another post.` };
}

type SaveChildren = (ids: string[]) => Promise<void>;

async function createChildren(
  post: SocialPost, create: (url: string) => Promise<Record<string, unknown>>, saveChildren?: SaveChildren,
) {
  if (!saveChildren || post.request.childMediaIds?.length) {
    throw new Error('Child media must be checkpointed before continuing. Inspect Meta; do not retry an attempted post.');
  }
  const ids: string[] = [];
  for (const url of socialPostImageUrls(post.request)) {
    const result = await create(url);
    if (!socialNumericId(result.id) || ids.includes(result.id)) throw new Error('Meta did not return a unique child media ID. Inspect Meta; do not retry.');
    ids.push(result.id);
    await saveChildren([...ids]);
  }
  return ids;
}

export async function createFacebookPost(post: SocialPost, config: MetaConfig, fetcher: Fetcher = fetch, saveChildren?: SaveChildren) {
  const images = socialPostImageUrls(post.request);
  let result: Record<string, unknown>;
  if (images.length > 1) {
    const ids = await createChildren(post, url => graph(config, `${post.request.pageId}/photos`, 'POST', {
      url, published: 'false',
    }, fetcher, 'organic publishing request'), saveChildren);
    result = await graph(config, `${post.request.pageId}/feed`, 'POST', {
      message: post.request.caption, attached_media: JSON.stringify(ids.map(id => ({ media_fbid: id }))),
    }, fetcher, 'organic publishing request');
    result = { post_id: result.id };
  } else {
    result = await graph(config, `${post.request.pageId}/photos`, 'POST', {
      url: post.request.imageUrl, caption: post.request.caption, published: 'true',
    }, fetcher, 'organic publishing request');
  }
  if (typeof result.post_id !== 'string' || !new RegExp(`^${post.request.pageId}_\\d{1,30}$`).test(result.post_id)) {
    throw new Error('Facebook may have published the photo but did not return a valid post ID. Inspect the Page; do not retry.');
  }
  return result.post_id;
}

export async function createInstagramContainer(post: SocialPost, config: MetaConfig, fetcher: Fetcher = fetch, saveChildren?: SaveChildren) {
  if (!socialNumericId(post.request.instagramUserId)) throw new Error('A verified Instagram publishing identity is required.');
  const path = `${post.request.instagramUserId}/media`;
  const images = socialPostImageUrls(post.request);
  const parameters: Record<string, string> = images.length > 1
    ? { media_type: 'CAROUSEL', children: (await createChildren(post, url => graph(config, path, 'POST', {
      image_url: url, is_carousel_item: 'true',
    }, fetcher, 'organic publishing request'), saveChildren)).join(','), caption: post.request.caption }
    : { image_url: post.request.imageUrl, caption: post.request.caption };
  const result = await graph(config, path, 'POST', parameters, fetcher, 'organic publishing request');
  if (!socialNumericId(result.id)) throw new Error('Instagram did not return a valid container ID. Inspect Meta; do not retry.');
  return result.id;
}

export async function publishInstagramContainer(post: SocialPost, config: MetaConfig, fetcher: Fetcher = fetch) {
  if (!socialNumericId(post.request.instagramUserId) || !socialNumericId(post.container_id)) throw new Error('The saved Instagram container or identity is invalid.');
  const result = await graph(config, `${post.request.instagramUserId}/media_publish`, 'POST', {
    creation_id: post.container_id,
  }, fetcher, 'organic publishing request');
  if (!socialNumericId(result.id)) throw new Error('Instagram may have published the post but did not return a valid ID. Inspect the profile; do not retry.');
  return result.id;
}
