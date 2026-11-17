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
  videoUpload?: { appId: string; userAccessToken: string; graphApiVersion: string };
}

export async function publishingAccess(
  config: MetaConfig, pageId: string, platforms: SocialPlatform[], enabled: boolean, fetcher: Fetcher = fetch,
  appId?: string,
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
  const videoUpload = appId && /^\d{1,30}$/.test(appId)
    ? { appId, userAccessToken: config.accessToken, graphApiVersion: config.graphApiVersion }
    : undefined;
  return {
    config: pageConfig,
    setup: { enabled, pageId, pageName: page.name, ...(instagram ? { instagram } : {}) },
    ...(videoUpload ? { videoUpload } : {}),
  };
}

export function verifyPublishingIdentity(post: SocialPost, access: PublishingAccess) {
  if (post.request.pageId !== access.setup.pageId
    || (post.platform === 'instagram' && post.request.instagramUserId !== access.setup.instagram?.id)) {
    throw new Error('The publishing identity changed. Prepare and review a new draft before publishing; do not retry an attempted post.');
  }
}

export async function readPublishedPost(post: SocialPost, config: MetaConfig, fetcher: Fetcher = fetch) {
  if (!post.post_id) throw new Error('No saved post ID is available. Inspect the destination profile; do not publish again.');
  const isVideo = post.request.mediaType === 'video';
  const result = await graph(config, post.post_id, 'GET', {
    fields: post.platform === 'facebook'
      ? isVideo ? 'id,permalink_url,published,from,status' : 'id,permalink_url,is_published,from'
      : isVideo ? 'id,permalink,media_type,media_product_type' : 'id,permalink,media_type',
  }, fetcher, 'organic publishing request');
  if (post.platform === 'facebook' && isVideo) {
    const videoStatus = socialRecord(result.status) ? result.status.video_status : undefined;
    if (videoStatus === 'error') {
      return { status: 'needs_attention' as const, error: 'Facebook could not process this video. Inspect the Page before taking further action.' };
    }
    if (result.published !== true || videoStatus === 'processing' || videoStatus === 'uploading') {
      return { status: 'processing' as const, error: null };
    }
  }
  const permalink = post.platform === 'facebook' ? result.permalink_url : result.permalink;
  if (result.id !== post.post_id || !socialPermalink(permalink, post.platform)
    || (post.platform === 'facebook' && ((isVideo ? result.published !== true : result.is_published !== true)
      || !socialRecord(result.from) || result.from.id !== post.request.pageId))
    || (post.platform === 'instagram' && (isVideo
      ? result.media_type !== 'VIDEO' || result.media_product_type !== 'REELS'
      : result.media_type !== (post.request.mediaType === 'mixed' || socialPostImageUrls(post.request).length > 1 ? 'CAROUSEL_ALBUM' : 'IMAGE')))) {
    throw new Error('Meta did not verify the published post. Inspect the destination profile; do not publish again.');
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

export async function instagramChildrenStatus(post: SocialPost, config: MetaConfig, fetcher: Fetcher = fetch) {
  const ids = post.request.childMediaIds;
  if (post.request.mediaType !== 'mixed' || !ids || ids.length !== socialPostImageUrls(post.request).length + 1) {
    throw new Error('The saved mixed carousel children are incomplete. Inspect Instagram; do not recreate them.');
  }
  let processing = false;
  for (const id of ids) {
    const state = await containerStatus({ ...post, container_id: id }, config, fetcher);
    if (state.status === 'needs_attention') return state;
    if (state.status === 'processing') processing = true;
  }
  return { status: processing ? 'processing' as const : 'ready' as const, error: null };
}

type SaveChildren = (ids: string[]) => Promise<void>;

async function createChildren(
  post: SocialPost, create: (url: string) => Promise<Record<string, unknown>>, saveChildren?: SaveChildren,
  mediaUrls = socialPostImageUrls(post.request),
) {
  if (!saveChildren || post.request.childMediaIds?.length) {
    throw new Error('Child media must be checkpointed before continuing. Inspect Meta; do not retry an attempted post.');
  }
  const ids: string[] = [];
  for (const url of mediaUrls) {
    const result = await create(url);
    if (!socialNumericId(result.id) || ids.includes(result.id)) throw new Error('Meta did not return a unique child media ID. Inspect Meta; do not retry.');
    ids.push(result.id);
    await saveChildren([...ids]);
  }
  return ids;
}

const MAX_FACEBOOK_VIDEO_BYTES = 500 * 1024 * 1024;
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

async function uploadFacebookVideo(
  post: SocialPost, pageConfig: MetaConfig, uploadConfig: NonNullable<PublishingAccess['videoUpload']>, fetcher: Fetcher,
) {
  const videoUrl = post.request.videoUrl;
  if (!videoUrl) throw new Error('A published product video is required. Inspect the product media before publishing.');

  let source: Response;
  try {
    source = await fetcher(videoUrl, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error('The saved product video could not be reached. Inspect the product media; do not retry an uncertain post.');
  }
  const contentLength = source.headers.get('Content-Length');
  const byteLength = contentLength && /^\d+$/.test(contentLength) ? Number(contentLength) : NaN;
  if (!source.ok || source.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'video/mp4'
    || !Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > MAX_FACEBOOK_VIDEO_BYTES) {
    throw new Error('Facebook video upload requires a reachable MP4 up to 500 MB. Check the published product video; do not retry.');
  }

  const graphUrl = `https://graph.facebook.com/${uploadConfig.graphApiVersion}`;
  let session: unknown;
  try {
    const response = await fetcher(`${graphUrl}/${uploadConfig.appId}/uploads?${new URLSearchParams({
      file_name: 'product-making-video.mp4', file_length: String(byteLength), file_type: 'video/mp4',
    })}`, {
      method: 'POST', headers: { Authorization: `Bearer ${uploadConfig.userAccessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    session = await response.json();
    if (!response.ok || !record(session)) throw new Error('upload session rejected');
  } catch {
    throw new Error('Meta could not start the Facebook video upload. Inspect the Page before taking further action.');
  }
  if (typeof session.id !== 'string' || !/^upload:[A-Za-z0-9._:-]{1,200}$/.test(session.id)) {
    throw new Error('Meta returned an invalid Facebook video upload session. Inspect the Page; do not retry.');
  }

  let video: Response;
  try {
    video = await fetcher(videoUrl, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(90_000) });
  } catch {
    throw new Error('The saved product video download failed. Inspect the Page before taking further action.');
  }
  const downloadedLength = video.headers.get('Content-Length');
  if (!video.ok || video.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'video/mp4'
    || downloadedLength !== String(byteLength) || !video.body) {
    await video.body?.cancel();
    throw new Error('The published product video changed during upload. Inspect the Page; do not retry.');
  }

  let uploaded: unknown;
  try {
    const response = await fetcher(`${graphUrl}/${session.id}`, {
      method: 'POST',
      headers: { Authorization: `OAuth ${uploadConfig.userAccessToken}`, 'Content-Type': 'video/mp4', file_offset: '0' },
      body: video.body,
      signal: AbortSignal.timeout(120_000),
    });
    uploaded = await response.json();
    if (!response.ok || !record(uploaded)) throw new Error('video bytes rejected');
  } catch {
    throw new Error('Meta could not receive the Facebook video. Inspect the Page before taking further action.');
  }
  if (typeof uploaded.h !== 'string' || !uploaded.h.trim() || uploaded.h.length > 10000) {
    throw new Error('Meta returned an invalid Facebook video handle. Inspect the Page; do not retry.');
  }

  let published: unknown;
  try {
    const response = await fetcher(`https://graph-video.facebook.com/${pageConfig.graphApiVersion}/${post.request.pageId}/videos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pageConfig.accessToken}` },
      body: new URLSearchParams({
        title: post.request.productName, description: post.request.caption, fbuploader_video_file_chunk: uploaded.h,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    published = await response.json();
    if (!response.ok || !record(published)) throw new Error('video publish rejected');
  } catch {
    throw new Error('Facebook could not publish the uploaded video. Inspect the Page before taking further action.');
  }
  if (!socialNumericId(published.id)) throw new Error('Facebook did not return a valid video ID. Inspect the Page; do not retry.');
  return published.id;
}

export async function createFacebookPost(
  post: SocialPost, config: MetaConfig, fetcher: Fetcher = fetch, saveChildren?: SaveChildren,
  videoUpload?: PublishingAccess['videoUpload'],
) {
  if (post.request.mediaType === 'mixed') throw new Error('Mixed photo/video carousels are supported for Instagram only. No Facebook post was created.');
  if (post.request.mediaType === 'video') {
    if (!videoUpload) throw new Error('Facebook video upload is not configured. Contact the site operator.');
    return uploadFacebookVideo(post, config, videoUpload, fetcher);
  }
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
  if (post.request.mediaType === 'mixed') {
    const videoUrl = post.request.videoUrl;
    if (!videoUrl) throw new Error('A published making video is required for a mixed carousel.');
    const ids = post.request.childMediaIds ?? await createChildren(post, url => graph(config, path, 'POST',
      url === videoUrl ? { media_type: 'VIDEO', video_url: url, is_carousel_item: 'true' }
        : { image_url: url, is_carousel_item: 'true' },
      fetcher, 'organic publishing request'), saveChildren, [...socialPostImageUrls(post.request), videoUrl]);
    const state = await instagramChildrenStatus({ ...post, request: { ...post.request, childMediaIds: ids } }, config, fetcher);
    if (state.status === 'processing') return null;
    if (state.status !== 'ready') throw new Error(state.error ?? 'Instagram could not process a carousel item. Inspect the profile; do not retry.');
    const result = await graph(config, path, 'POST', {
      media_type: 'CAROUSEL', children: ids.join(','), caption: post.request.caption,
    }, fetcher, 'organic publishing request');
    if (!socialNumericId(result.id)) throw new Error('Instagram did not return a valid mixed carousel ID. Inspect the profile; do not retry.');
    return result.id;
  }
  if (post.request.mediaType === 'video') {
    if (!post.request.videoUrl) throw new Error('A published product video is required. Inspect the product media before publishing.');
    const result = await graph(config, path, 'POST', {
      media_type: 'REELS', video_url: post.request.videoUrl, cover_url: post.request.imageUrl,
      caption: post.request.caption, share_to_feed: 'true',
    }, fetcher, 'organic publishing request');
    if (!socialNumericId(result.id)) throw new Error('Instagram did not return a valid Reel container ID. Inspect Meta; do not retry.');
    return result.id;
  }
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
