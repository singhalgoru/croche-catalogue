export type InstagramFeedMediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';

export interface InstagramFeedPost {
  id: string;
  permalink: string;
  previewUrl: string;
  caption: string;
  mediaType: InstagramFeedMediaType;
  timestamp: string;
  likesCount?: number;
  viewsCount?: number;
  viewsChecked?: boolean;
  productId?: string | null;
  productMatchStatus?: 'matched' | 'unmatched';
}

export interface InstagramFeed {
  username: string;
  posts: InstagramFeedPost[];
  fetchedAt: string;
  stale: boolean;
}

export const instagramFeedWindowMs = 30 * 24 * 60 * 60 * 1000;
export const instagramFeedPostLimit = 25;
export const instagramHomepagePostLimit = 6;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export function isInstagramMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['cdninstagram.com', 'fbcdn.net', 'fbsbx.com']
      .some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function isInstagramPermalink(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(url.hostname)
      && /^\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

function parseFeedPost(value: unknown): InstagramFeedPost {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^\d{1,30}$/.test(value.id)
    || !isInstagramPermalink(value.permalink) || !isInstagramMediaUrl(value.previewUrl)
    || typeof value.caption !== 'string' || value.caption.length > 2200
    || (value.mediaType !== 'IMAGE' && value.mediaType !== 'VIDEO' && value.mediaType !== 'CAROUSEL_ALBUM')
    || typeof value.timestamp !== 'string' || !Number.isFinite(Date.parse(value.timestamp))
    || (value.likesCount !== undefined && (!Number.isSafeInteger(value.likesCount) || (value.likesCount as number) < 0))
    || (value.viewsCount !== undefined && (!Number.isSafeInteger(value.viewsCount) || (value.viewsCount as number) < 0))
    || (value.viewsChecked !== undefined && typeof value.viewsChecked !== 'boolean')
    || (value.productId !== undefined && value.productId !== null
      && (typeof value.productId !== 'string' || value.productId.length < 1 || value.productId.length > 80))
    || (value.productMatchStatus !== undefined
      && value.productMatchStatus !== 'matched' && value.productMatchStatus !== 'unmatched')) {
    throw new Error('Instagram returned an invalid feed post.');
  }
  if ((value.productMatchStatus === 'matched' && typeof value.productId !== 'string')
    || (value.productMatchStatus === 'unmatched' && value.productId != null)) {
    throw new Error('Instagram returned an invalid product match.');
  }
  return {
    id: value.id,
    permalink: value.permalink,
    previewUrl: value.previewUrl,
    caption: value.caption,
    mediaType: value.mediaType,
    timestamp: new Date(value.timestamp).toISOString(),
    ...(value.likesCount !== undefined ? { likesCount: value.likesCount as number } : {}),
    ...(value.viewsCount !== undefined ? { viewsCount: value.viewsCount as number } : {}),
    ...(value.viewsChecked !== undefined ? { viewsChecked: value.viewsChecked } : {}),
    ...(value.productId !== undefined ? { productId: value.productId as string | null } : {}),
    ...(value.productMatchStatus !== undefined ? { productMatchStatus: value.productMatchStatus } : {}),
  };
}

export function parseInstagramFeedResponse(value: unknown, now = Date.now()): InstagramFeed {
  if (!isRecord(value) || typeof value.username !== 'string' || !/^[a-zA-Z0-9._]{1,30}$/.test(value.username)
    || !Array.isArray(value.posts) || value.posts.length > instagramFeedPostLimit
    || typeof value.fetchedAt !== 'string' || !Number.isFinite(Date.parse(value.fetchedAt))
    || typeof value.stale !== 'boolean') {
    throw new Error('Instagram feed returned an invalid response.');
  }
  const posts = value.posts.map(parseFeedPost)
    .filter(post => {
      const timestamp = Date.parse(post.timestamp);
      return timestamp <= now + 5 * 60 * 1000 && now - timestamp <= instagramFeedWindowMs;
    })
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
  return {
    username: value.username,
    posts,
    fetchedAt: new Date(value.fetchedAt).toISOString(),
    stale: value.stale,
  };
}

export function normalizeInstagramMedia(values: unknown, now = Date.now()): InstagramFeedPost[] {
  if (!Array.isArray(values)) throw new Error('Meta returned an invalid Instagram media list.');
  const posts: InstagramFeedPost[] = [];
  for (const value of values) {
    if (!isRecord(value) || typeof value.id !== 'string' || !/^\d{1,30}$/.test(value.id)
      || !isInstagramPermalink(value.permalink) || typeof value.timestamp !== 'string'
      || !Number.isFinite(Date.parse(value.timestamp))
      || (value.media_type !== 'IMAGE' && value.media_type !== 'VIDEO' && value.media_type !== 'CAROUSEL_ALBUM')) continue;
    const timestamp = Date.parse(value.timestamp);
    if (timestamp > now + 5 * 60 * 1000 || now - timestamp > instagramFeedWindowMs) continue;

    const mediaType = value.media_type;
    const candidates: unknown[] = mediaType === 'VIDEO' ? [value.thumbnail_url, value.media_url] : [value.media_url];
    if (Array.isArray(value.children)) {
      for (const child of value.children) {
        if (!isRecord(child)) continue;
        candidates.push(child.media_type === 'VIDEO' ? child.thumbnail_url : child.media_url);
      }
    }
    const previewUrl = candidates.find(isInstagramMediaUrl);
    if (!previewUrl) continue;
    posts.push({
      id: value.id,
      permalink: value.permalink,
      previewUrl,
      caption: typeof value.caption === 'string' ? value.caption.slice(0, 2200) : '',
      mediaType,
      timestamp: new Date(timestamp).toISOString(),
      ...(typeof value.like_count === 'number' && Number.isSafeInteger(value.like_count) && value.like_count >= 0
        ? { likesCount: value.like_count }
        : {}),
    });
  }
  return posts.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, instagramFeedPostLimit);
}
