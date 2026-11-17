import { loadSupabase } from '../lib/supabaseConfig';
import { getImageStorageErrorMessage } from './r2ImageStorage';
import {
  parseSocialPost, socialHttpsUrl, socialNumericId, socialRecord,
  type SocialPlatform, type SocialPost, type SocialPublishingSetup,
} from '../../supabase/functions/_shared/socialPosts';
import { socialPostColumns } from '../../supabase/functions/_shared/socialPosts';

export type { SocialPlatform, SocialPost, SocialPublishingSetup };
export { socialCaptionLimits } from '../../supabase/functions/_shared/socialPosts';

async function invoke(body: Record<string, unknown> | FormData): Promise<unknown> {
  const client = await loadSupabase();
  if (!client) throw new Error('Organic posting requires an online admin connection.');
  const { data, error } = await client.functions.invoke('marketing-post', { body });
  if (error) throw new Error(await getImageStorageErrorMessage(error));
  return data;
}

function parsePosts(value: unknown, productId: string): SocialPost[] {
  if (!socialRecord(value) || !Array.isArray(value.posts)) throw new Error('Invalid social post response.');
  const posts = value.posts.map(parseSocialPost);
  if (posts.some(post => post.product_id !== productId) || new Set(posts.map(post => post.id)).size !== posts.length
    || new Set(posts.filter(post => post.status !== 'published').map(post => post.platform)).size !== posts.filter(post => post.status !== 'published').length) {
    throw new Error('Social posting returned a different product, duplicate post or conflicting active platform.');
  }
  return posts;
}

export async function listProductSocialPosts(productId: string): Promise<SocialPost[]> {
  const client = await loadSupabase();
  if (!client) throw new Error('Saved posts require an online admin connection.');
  const { data, error } = await client.from('marketing_social_posts').select(socialPostColumns).eq('product_id', productId).order('platform');
  if (error) throw new Error(`Unable to load saved social posts: ${error.message}`);
  return parsePosts({ posts: data }, productId);
}

export async function checkSocialPublishing(platforms: SocialPlatform[]): Promise<SocialPublishingSetup> {
  const data = await invoke({ action: 'setup', platforms });
  if (!socialRecord(data) || !socialRecord(data.setup)) throw new Error('Invalid social publishing setup.');
  const setup = data.setup;
  if (typeof setup.enabled !== 'boolean' || !socialNumericId(setup.pageId) || typeof setup.pageName !== 'string'
    || !setup.pageName.trim() || setup.pageName.length > 300) throw new Error('Invalid Facebook publishing setup.');
  let instagram: SocialPublishingSetup['instagram'];
  if (platforms.includes('instagram')) {
    if (!socialRecord(setup.instagram) || !socialNumericId(setup.instagram.id) || typeof setup.instagram.username !== 'string'
      || !/^[a-zA-Z0-9._]{1,30}$/.test(setup.instagram.username)) throw new Error('Invalid Instagram publishing setup.');
    instagram = { id: setup.instagram.id, username: setup.instagram.username };
  }
  return { enabled: setup.enabled, pageId: setup.pageId, pageName: setup.pageName, ...(instagram ? { instagram } : {}) };
}

export async function prepareProductSocialPosts(input: {
  productId: string; sourceImageUrl: string; sourceImageUrls?: string[]; pageId: string; instagramUserId?: string;
  mediaType?: 'image' | 'video' | 'mixed'; videoUrl?: string;
  replacesPostIds?: Partial<Record<SocialPlatform, string>>;
  captions: Partial<Record<SocialPlatform, string>>;
}, image?: File | File[]): Promise<SocialPost[]> {
  if (input.mediaType === 'video') {
    if (!socialHttpsUrl(input.videoUrl) || image !== undefined || input.sourceImageUrls !== undefined) {
      throw new Error('Choose a current product making video without photo uploads.');
    }
    return parsePosts(await invoke({ ...input, action: 'prepare' }), input.productId);
  }
  if (!image || (input.mediaType !== 'mixed' && input.videoUrl !== undefined)) throw new Error('Prepare a post with JPEG previews or a published making video.');
  const images = Array.isArray(image) ? image : [image];
  if (!images.length || images.length > 10 || (input.sourceImageUrls && input.sourceImageUrls.length !== images.length)) {
    throw new Error('Select between 1 and 10 product images with matching JPEG previews.');
  }
  if (input.mediaType === 'mixed' && (!socialHttpsUrl(input.videoUrl) || !input.sourceImageUrls
    || images.length > 9 || !input.captions.instagram || Object.keys(input.captions).some(platform => platform !== 'instagram'))) {
    throw new Error('Instagram mixed posts require one to nine matching photos and one published making video, without Facebook selected.');
  }
  if (images.reduce((total, file) => total + file.size, 0) > 8 * 1024 * 1024) {
    throw new Error('Selected JPEG previews exceed 8 MB in total. Select fewer images.');
  }
  const body = new FormData();
  body.append('input', JSON.stringify({ ...input, action: 'prepare' }));
  images.forEach((file, index) => body.append('image', file, `social-post-${index + 1}.jpg`));
  return parsePosts(await invoke(body), input.productId);
}

export async function publishProductSocialPosts(productId: string, posts: Pick<SocialPost, 'id' | 'revision'>[]): Promise<SocialPost[]> {
  return parsePosts(await invoke({ action: 'publish', posts, confirmLive: true }), productId);
}

export async function refreshProductSocialPosts(productId: string): Promise<SocialPost[]> {
  return parsePosts(await invoke({ action: 'refresh', productId }), productId);
}
