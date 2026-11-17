import { isSocialPlatform, socialCaptionLimits, socialHttpsUrl, socialImageUrlList, socialNumericId, socialRecord, socialUuid, type SocialPlatform } from '../_shared/socialPosts.ts';

type PrepareInput = {
  action: 'prepare'; productId: string; sourceImageUrl: string; pageId: string; instagramUserId?: string;
  mediaType?: 'image' | 'video' | 'mixed'; videoUrl?: string;
  replacesPostIds?: Partial<Record<SocialPlatform, string>>;
  sourceImageUrls?: string[];
  captions: Partial<Record<SocialPlatform, string>>;
};
type PostInput = { action: 'setup'; platforms: SocialPlatform[] } | PrepareInput
  | { action: 'refresh'; productId: string }
  | { action: 'publish'; confirmLive: true; posts: { id: string; revision: number }[] };

function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unsupported social publishing fields.');
}

export function parsePostInput(value: unknown): PostInput {
  if (!socialRecord(value)) throw new Error('A social publishing action is required.');
  if (value.action === 'setup') {
    keys(value, ['action', 'platforms']);
    if (!Array.isArray(value.platforms) || value.platforms.length < 1 || value.platforms.length > 2
      || !value.platforms.every(isSocialPlatform) || new Set(value.platforms).size !== value.platforms.length) {
      throw new Error('Select Facebook, Instagram or both for publishing verification.');
    }
    return { action: 'setup', platforms: value.platforms };
  }
  if (value.action === 'refresh') {
    keys(value, ['action', 'productId']);
    if (!socialUuid(value.productId)) throw new Error('Select a product to refresh its saved posts.');
    return { action: 'refresh', productId: value.productId };
  }
  if (value.action === 'prepare') {
    keys(value, ['action', 'productId', 'sourceImageUrl', 'sourceImageUrls', 'pageId', 'instagramUserId', 'captions', 'mediaType', 'videoUrl', 'replacesPostIds']);
    if (!socialUuid(value.productId) || !socialHttpsUrl(value.sourceImageUrl) || !socialNumericId(value.pageId)
      || (value.mediaType !== undefined && value.mediaType !== 'image' && value.mediaType !== 'video' && value.mediaType !== 'mixed')
      || !socialRecord(value.captions) || Object.keys(value.captions).length < 1 || Object.keys(value.captions).length > 2) {
      throw new Error('Prepare a published product image, reviewed identity and editable captions.');
    }
    const mediaType = value.mediaType ?? 'image';
    if ((mediaType === 'video' && (!socialHttpsUrl(value.videoUrl) || value.sourceImageUrls !== undefined))
      || (mediaType === 'mixed' && (!socialHttpsUrl(value.videoUrl) || !socialImageUrlList(value.sourceImageUrls)
        || value.sourceImageUrls.length > 9 || Object.keys(value.captions).some(platform => platform !== 'instagram')))
      || (mediaType === 'image' && value.videoUrl !== undefined)) {
      throw new Error('Choose photos, a making video, or up to nine photos plus one making video for Instagram only.');
    }
    if (value.sourceImageUrls !== undefined && (!socialImageUrlList(value.sourceImageUrls)
      || value.sourceImageUrls[0] !== value.sourceImageUrl)) {
      throw new Error('Select one to ten unique product images in preview order; the first must match the source image.');
    }
    const captions: PrepareInput['captions'] = {};
    for (const [platform, caption] of Object.entries(value.captions)) {
      if (!isSocialPlatform(platform) || typeof caption !== 'string' || !caption.trim() || caption.length > socialCaptionLimits[platform]) {
        throw new Error('Enter a non-empty caption within the displayed platform limit.');
      }
      captions[platform] = caption.trim();
    }
    if (captions.instagram !== undefined && !socialNumericId(value.instagramUserId)) throw new Error('Verify the Instagram publishing identity first.');
    if (captions.instagram === undefined && value.instagramUserId !== undefined) throw new Error('Instagram identity requires an Instagram post.');
    const replacesPostIds: PrepareInput['replacesPostIds'] = {};
    if (value.replacesPostIds !== undefined) {
      if (!socialRecord(value.replacesPostIds) || !Object.keys(value.replacesPostIds).length) throw new Error('Select a published post to replace.');
      for (const [platform, id] of Object.entries(value.replacesPostIds)) {
        if (!isSocialPlatform(platform) || !captions[platform] || !socialUuid(id)) throw new Error('Select a published post on each replacement platform.');
        replacesPostIds[platform] = id;
      }
    }
    return { action: 'prepare', productId: value.productId, sourceImageUrl: value.sourceImageUrl, pageId: value.pageId, captions,
      ...(value.mediaType !== undefined ? { mediaType } : {}),
      ...(typeof value.videoUrl === 'string' ? { videoUrl: value.videoUrl } : {}),
      ...(value.replacesPostIds !== undefined ? { replacesPostIds } : {}),
      ...(value.sourceImageUrls !== undefined ? { sourceImageUrls: [...value.sourceImageUrls as string[]] } : {}),
      ...(socialNumericId(value.instagramUserId) ? { instagramUserId: value.instagramUserId } : {}) };
  }
  if (value.action === 'publish') {
    keys(value, ['action', 'confirmLive', 'posts']);
    if (value.confirmLive !== true || !Array.isArray(value.posts) || value.posts.length < 1 || value.posts.length > 2) {
      throw new Error('Explicitly confirm publishing the reviewed posts LIVE.');
    }
    const posts: { id: string; revision: number }[] = [];
    for (const item of value.posts) {
      if (!socialRecord(item)) throw new Error('Invalid reviewed post.');
      keys(item, ['id', 'revision']);
      if (!socialUuid(item.id) || typeof item.revision !== 'number' || !Number.isSafeInteger(item.revision)
        || item.revision < 1 || posts.some(post => post.id === item.id)) {
        throw new Error('Refresh and review the saved post version before publishing.');
      }
      posts.push({ id: item.id, revision: item.revision });
    }
    return { action: 'publish', confirmLive: true, posts };
  }
  throw new Error('Unsupported social publishing action.');
}
