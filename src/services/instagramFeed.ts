import { loadSupabase } from '../lib/supabaseConfig';
import { parseInstagramFeedResponse, type InstagramFeed } from '../../supabase/functions/_shared/instagramFeed';

export async function fetchInstagramFeed(): Promise<InstagramFeed> {
  const client = await loadSupabase();
  if (!client) throw new Error('Instagram posts require an online connection.');
  const { data, error } = await client.functions.invoke('instagram-feed', { body: {} });
  if (error) throw new Error(`Unable to load Instagram posts: ${error.message}`);
  return parseInstagramFeedResponse(data);
}

export function readInstagramSnapshot(): InstagramFeed | null {
  const text = document.getElementById('instagram-snapshot')?.textContent;
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || !('posts' in value) || !Array.isArray(value.posts)) {
      throw new Error('Invalid Instagram snapshot.');
    }
    const posts = value.posts.map((post: unknown) => {
      if (!post || typeof post !== 'object' || !('id' in post) || !('previewUrl' in post)
        || typeof post.id !== 'string' || !/^\d{1,30}$/.test(post.id)
        || post.previewUrl !== `/instagram-snapshot/${post.id}.webp`) {
        throw new Error('Invalid Instagram snapshot image.');
      }
      return { ...post, previewUrl: 'https://cdninstagram.com/snapshot' };
    });
    const feed = parseInstagramFeedResponse({ ...value, posts });
    const age = Date.now() - Date.parse(feed.fetchedAt);
    if (age < -5 * 60 * 1000 || age > 48 * 60 * 60 * 1000) throw new Error('Instagram snapshot is too old.');
    return {
      ...feed, stale: true,
      posts: feed.posts.map(post => ({ ...post, previewUrl: `/instagram-snapshot/${post.id}.webp` })),
    };
  } catch (error) {
    console.error('Unable to read the saved Instagram gallery:', error);
    return null;
  }
}
