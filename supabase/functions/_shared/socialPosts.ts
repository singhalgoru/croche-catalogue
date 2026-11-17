export type SocialPlatform = 'facebook' | 'instagram';
export type SocialPostStatus = 'draft' | 'publishing' | 'processing' | 'ready' | 'published' | 'needs_attention';
export const socialCaptionLimits = { facebook: 5000, instagram: 2200 } as const;
export const socialPostColumns = 'id,product_id,platform,status,request,container_id,post_id,permalink,error,attempt_started_at,publish_started_at,revision,updated_at';
export const socialUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export const socialNumericId = (value: unknown): value is string => typeof value === 'string' && /^\d{1,30}$/.test(value);
export const socialRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
export const isSocialPlatform = (value: unknown): value is SocialPlatform => value === 'facebook' || value === 'instagram';
const nullableText = (value: unknown): value is string | null => value === null || typeof value === 'string';
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export function socialHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port;
  } catch { return false; }
}

export function socialPermalink(value: unknown, platform: SocialPlatform): value is string {
  if (!socialHttpsUrl(value)) return false;
  const url = new URL(value);
  return platform === 'facebook'
    ? url.hostname === 'www.facebook.com' && url.pathname.length > 1
    : url.hostname === 'www.instagram.com' && /^\/p\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
}

export interface SocialPostSnapshot {
  productName: string;
  productUrl: string;
  sourceImageUrl: string;
  imageUrl: string;
  sourceImageUrls?: string[];
  imageUrls?: string[];
  childMediaIds?: string[];
  caption: string;
  pageId: string;
  pageName: string;
  instagramUserId?: string;
  instagramUsername?: string;
}

export function socialPostImageUrls(snapshot: SocialPostSnapshot): string[] {
  return snapshot.imageUrls ?? [snapshot.imageUrl];
}

export function socialImageUrlList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 10
    && value.every(socialHttpsUrl) && new Set(value).size === value.length;
}

export interface SocialPost {
  id: string;
  product_id: string;
  platform: SocialPlatform;
  status: SocialPostStatus;
  request: SocialPostSnapshot;
  container_id: string | null;
  post_id: string | null;
  permalink: string | null;
  error: string | null;
  attempt_started_at: string | null;
  publish_started_at: string | null;
  revision: number;
  updated_at: string;
}

export interface SocialPublishingSetup {
  enabled: boolean;
  pageId: string;
  pageName: string;
  instagram?: { id: string; username: string };
}

export function parseSocialPost(value: unknown): SocialPost {
  if (!socialRecord(value) || !socialUuid(value.id) || !socialUuid(value.product_id) || !isSocialPlatform(value.platform)
    || (value.status !== 'draft' && value.status !== 'publishing' && value.status !== 'processing'
      && value.status !== 'ready' && value.status !== 'published' && value.status !== 'needs_attention')
    || !socialRecord(value.request) || !nullableText(value.container_id) || !nullableText(value.post_id)
    || !nullableText(value.permalink) || !nullableText(value.error)
    || !nullableText(value.attempt_started_at) || !nullableText(value.publish_started_at) || !timestamp(value.updated_at)
    || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 1) {
    throw new Error('Invalid saved social post response.');
  }
  const snapshot = value.request;
  const hasImages = snapshot.sourceImageUrls !== undefined || snapshot.imageUrls !== undefined;
  if ((hasImages && (!socialImageUrlList(snapshot.sourceImageUrls) || !socialImageUrlList(snapshot.imageUrls)
    || snapshot.sourceImageUrls.length !== snapshot.imageUrls.length
    || snapshot.sourceImageUrls[0] !== snapshot.sourceImageUrl || snapshot.imageUrls[0] !== snapshot.imageUrl))
    || (snapshot.childMediaIds !== undefined && (!Array.isArray(snapshot.childMediaIds)
      || snapshot.childMediaIds.length < 1 || snapshot.childMediaIds.length > (Array.isArray(snapshot.imageUrls) ? snapshot.imageUrls.length : 1)
      || !snapshot.childMediaIds.every(socialNumericId) || new Set(snapshot.childMediaIds).size !== snapshot.childMediaIds.length))) {
    throw new Error('Invalid saved social post images.');
  }
  if (!text(snapshot.productName, 300) || !socialHttpsUrl(snapshot.productUrl) || !socialHttpsUrl(snapshot.sourceImageUrl)
    || !socialHttpsUrl(snapshot.imageUrl) || !text(snapshot.caption, socialCaptionLimits[value.platform])
    || !socialNumericId(snapshot.pageId) || !text(snapshot.pageName, 300)
    || (value.container_id !== null && !socialNumericId(value.container_id))
    || (value.attempt_started_at !== null && !timestamp(value.attempt_started_at))
    || (value.publish_started_at !== null && !timestamp(value.publish_started_at))
    || (value.permalink !== null && !socialPermalink(value.permalink, value.platform))
    || (value.post_id !== null && !(value.platform === 'instagram' ? /^\d{1,30}$/ : /^\d{1,30}_\d{1,30}$/).test(value.post_id))
    || (value.status === 'published' && (!value.post_id || !value.permalink))
    || ((value.status === 'processing' || value.status === 'ready') && (value.platform !== 'instagram' || !value.container_id))) {
    throw new Error('Invalid saved social post details.');
  }
  let instagram: Pick<SocialPostSnapshot, 'instagramUserId' | 'instagramUsername'> = {};
  if (value.platform === 'instagram') {
    if (!socialNumericId(snapshot.instagramUserId) || typeof snapshot.instagramUsername !== 'string'
      || !/^[a-zA-Z0-9._]{1,30}$/.test(snapshot.instagramUsername)) throw new Error('Invalid saved Instagram identity.');
    instagram = { instagramUserId: snapshot.instagramUserId, instagramUsername: snapshot.instagramUsername };
  }
  return {
    id: value.id, product_id: value.product_id, platform: value.platform, status: value.status,
    request: {
      productName: snapshot.productName, productUrl: snapshot.productUrl, sourceImageUrl: snapshot.sourceImageUrl,
      imageUrl: snapshot.imageUrl, caption: snapshot.caption, pageId: snapshot.pageId, pageName: snapshot.pageName, ...instagram,
      ...(hasImages ? { sourceImageUrls: [...snapshot.sourceImageUrls as string[]], imageUrls: [...snapshot.imageUrls as string[]] } : {}),
      ...(snapshot.childMediaIds !== undefined ? { childMediaIds: [...snapshot.childMediaIds as string[]] } : {}),
    },
    container_id: value.container_id, post_id: value.post_id, permalink: value.permalink, error: value.error,
    attempt_started_at: value.attempt_started_at, publish_started_at: value.publish_started_at, revision: value.revision, updated_at: value.updated_at,
  };
}
