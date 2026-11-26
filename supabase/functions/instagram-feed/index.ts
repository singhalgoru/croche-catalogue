import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseInstagramFeedResponse } from '../_shared/instagramFeed.ts';
import { loadMetaAccess } from '../_shared/loadMetaAccess.ts';
import { fetchInstagramFeed } from './meta.ts';
import { matchInstagramPosts, type InstagramMatchProduct } from './productMatcher.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const cacheDurationMs = 60 * 60 * 1000;
const unavailable = 'Instagram posts are temporarily unavailable. Please try again later.';
type CachedFeed = { username: string; posts: unknown; fetched_at: string };

async function matchFeedProducts(
  posts: ReturnType<typeof parseInstagramFeedResponse>['posts'],
  service: ReturnType<typeof createClient>,
  apiKey: string | undefined,
) {
  if (posts.every(post => post.productMatchStatus !== undefined)) return posts;
  const { data, error } = await service.from('products')
    .select('id,name,sku,public_slug,description,published,product_variants(name,color,image_url,in_stock,available_quantity,sort_order)')
    .eq('published', true);
  if (error || !Array.isArray(data)) {
    console.error('Unable to load products for Instagram matching:', error?.message ?? 'No product list returned.');
    return posts;
  }
  try {
    return await matchInstagramPosts(posts, data as InstagramMatchProduct[], apiKey);
  } catch (failure) {
    console.error('Unable to match Instagram posts to products:', failure instanceof Error ? failure.message : 'Matching failed.');
    return posts;
  }
}

export async function handler(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const env = (name: string) => Deno.env.get(name);
  const url = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: unavailable }, 503);

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await service.from('instagram_feed_cache')
    .select('username,posts,fetched_at').eq('id', true).maybeSingle();
  if (error) {
    console.error('Unable to read the Instagram feed cache:', error.message);
    return json({ error: unavailable }, 503);
  }

  const now = Date.now();
  let cached: ReturnType<typeof parseInstagramFeedResponse> | null = null;
  if (data) {
    try {
      const row = data as CachedFeed;
      cached = parseInstagramFeedResponse({
        username: row.username, posts: row.posts, fetchedAt: row.fetched_at, stale: false,
      }, now);
      const age = now - Date.parse(cached.fetchedAt);
      if (age >= 0 && age < cacheDurationMs && cached.posts.every(post => post.viewsChecked !== undefined)) {
        const needsMatching = cached.posts.some(post => post.productMatchStatus === undefined);
        const posts = await matchFeedProducts(cached.posts, service, env('GEMINI_API_KEY'));
        if (needsMatching && posts.every(post => post.productMatchStatus !== undefined)) {
          const { error: cacheError } = await service.from('instagram_feed_cache').upsert({
            id: true, username: cached.username, posts, fetched_at: cached.fetchedAt,
          });
          if (cacheError) console.error('Unable to save Instagram product matches:', cacheError.message);
        }
        return json({ ...cached, posts });
      }
    } catch (failure) {
      console.error('Stored Instagram feed cache is invalid:', failure instanceof Error ? failure.message : 'Invalid cache.');
    }
  }

  let fresh: { username: string; posts: unknown[] };
  try {
    const pageId = env('META_PAGE_ID')?.trim() ?? '';
    const { config } = await loadMetaAccess(env);
    fresh = await fetchInstagramFeed(config, pageId);
  } catch (failure) {
    console.error('Unable to refresh the Instagram feed:', failure instanceof Error ? failure.message : 'Meta request failed.');
    if (cached) {
      const posts = await matchFeedProducts(cached.posts, service, env('GEMINI_API_KEY'));
      return json({ ...cached, posts, stale: true });
    }
    return json({ error: unavailable }, 502);
  }

  const fetchedAt = new Date(now).toISOString();
  const posts = await matchFeedProducts(
    parseInstagramFeedResponse({ ...fresh, fetchedAt, stale: false }, now).posts,
    service,
    env('GEMINI_API_KEY'),
  );
  const feed = parseInstagramFeedResponse({ ...fresh, posts, fetchedAt, stale: false }, now);
  const { error: cacheError } = await service.from('instagram_feed_cache').upsert({
    id: true, username: feed.username, posts: feed.posts, fetched_at: fetchedAt,
  });
  if (cacheError) {
    console.error('Unable to save the refreshed Instagram feed:', cacheError.message);
    if (cached) return json({ ...cached, stale: true });
    return json({ error: unavailable }, 503);
  }
  return json(feed);
}

Deno.serve(handler);
