import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadMetaAccess } from '../_shared/loadMetaAccess.ts';
import {
  parseSocialPost, socialHttpsUrl, socialNumericId, socialPostColumns, socialRecord,
  type SocialPlatform, type SocialPost, type SocialPostSnapshot,
} from '../_shared/socialPosts.ts';
import { parsePostInput } from './input.ts';
import { storePostImage } from './image.ts';
import {
  containerStatus, createFacebookPost, createInstagramContainer, publishInstagramContainer,
  publishingAccess, readPublishedPost, verifyPublishingIdentity,
} from './meta.ts';

const cors = {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const failureMessage = (error: unknown) => error instanceof Error ? error.message : 'Social publishing failed. Inspect the destination profile; do not retry an uncertain post.';

export async function handler(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Authentication is required.' }, 401);
  const env = (name: string) => Deno.env.get(name);
  const url = env('SUPABASE_URL');
  const anon = env('SUPABASE_ANON_KEY');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !key) return json({ error: 'Supabase function environment is incomplete.' }, 500);
  const auth = createClient(url, anon, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: user, error: userError } = await auth.auth.getUser();
  if (userError || !user.user) return json({ error: 'Authentication is required.' }, 401);
  const { data: admin, error: adminError } = await auth.rpc('is_catalogue_admin');
  if (adminError) return json({ error: 'Unable to verify admin access.' }, 500);
  if (!admin) return json({ error: 'Fresh admin verification is required to manage organic posts.' }, 403);
  let input;
  let image: File | undefined;
  try {
    if (Number(request.headers.get('Content-Length')) > 9 * 1024 * 1024) throw new Error('The prepared image request exceeds 9 MB.');
    if (request.headers.get('Content-Type')?.includes('multipart/form-data')) {
      const form = await request.formData();
      if ([...form.keys()].some(field => field !== 'input' && field !== 'image') || form.getAll('input').length !== 1 || form.getAll('image').length !== 1) {
        throw new Error('Upload one prepared JPEG and its post details.');
      }
      const metadata = form.get('input');
      const file = form.get('image');
      if (typeof metadata !== 'string' || metadata.length > 16000 || !(file instanceof File) || file.type !== 'image/jpeg' || file.size > 8 * 1024 * 1024) {
        throw new Error('Upload a prepared JPEG up to 8 MB.');
      }
      input = parsePostInput(JSON.parse(metadata));
      if (input.action !== 'prepare') throw new Error('Image uploads are only allowed when preparing post previews.');
      image = file;
    } else {
      const text = await request.text();
      if (text.length > 20000) throw new Error('The social publishing request is too large.');
      input = parsePostInput(JSON.parse(text));
      if (input.action === 'prepare') throw new Error('Preparing a post requires its JPEG preview upload.');
    }
  } catch (error) {
    return json({ error: error instanceof SyntaxError ? 'Invalid social publishing JSON.' : failureMessage(error) }, 400);
  }
  const service = createClient(url, key, { auth: { persistSession: false } });
  const table = () => service.from('marketing_social_posts');
  const readPosts = async (productId: string): Promise<SocialPost[]> => {
    const { data, error } = await table().select(socialPostColumns).eq('product_id', productId).order('platform');
    if (error || !Array.isArray(data)) throw new Error('Unable to read saved social posts. No new publishing request was sent.');
    return data.map(parseSocialPost);
  };
  const checkpoint = async (post: SocialPost, updates: Record<string, unknown>): Promise<SocialPost> => {
    const { data, error } = await table().update({ ...updates, revision: post.revision + 1, updated_at: new Date().toISOString() })
      .eq('id', post.id).eq('status', post.status).eq('revision', post.revision).select(socialPostColumns).maybeSingle();
    if (error || !data) throw new Error('Post progress changed or could not be saved. Refresh status and inspect the profile; do not retry publishing.');
    return parseSocialPost(data);
  };
  const readProduct = async (productId: string) => {
    const { data, error } = await service.from('products').select('id,name,public_slug,image_url,published').eq('id', productId).maybeSingle();
    if (error) throw new Error('Unable to verify the published product.');
    if (!socialRecord(data) || data.published !== true || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 300
      || typeof data.public_slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,199}$/.test(data.public_slug) || !socialHttpsUrl(data.image_url)) {
      throw new Error('Select a currently published product with a public product page and image.');
    }
    return { name: data.name, imageUrl: data.image_url, productUrl: `https://luviacreations.com/p/${data.public_slug}/` };
  };
  try {
    const pageId = env('META_PAGE_ID')?.trim();
    if (!socialNumericId(pageId)) throw new Error('The Meta publishing Page is not configured.');
    const enabled = env('META_ORGANIC_PUBLISHING_ENABLED') === 'true';
    const { config } = await loadMetaAccess(env);
    if (input.action === 'setup') {
      const access = await publishingAccess(config, pageId, input.platforms, enabled);
      return json({ setup: access.setup });
    }
    if (input.action === 'prepare') {
      if (!image) throw new Error('A prepared JPEG preview is required.');
      const product = await readProduct(input.productId);
      if (product.imageUrl !== input.sourceImageUrl) throw new Error('The product image changed. Select the product again and prepare a new preview.');
      const platforms = Object.keys(input.captions).filter((platform): platform is SocialPlatform => platform === 'facebook' || platform === 'instagram');
      const existing = await readPosts(input.productId);
      if (existing.some(post => platforms.includes(post.platform) && post.status !== 'draft')) {
        throw new Error('A selected platform already has a publishing attempt for this product. Refresh its status; do not prepare a duplicate.');
      }
      const access = await publishingAccess(config, pageId, platforms, enabled);
      if (input.pageId !== pageId || (platforms.includes('instagram') && input.instagramUserId !== access.setup.instagram?.id)) {
        throw new Error('The publishing identity changed. Check publishing access again before preparing the preview.');
      }
      const imageUrl = await storePostImage(env, input.productId, new Uint8Array(await image.arrayBuffer()));
      for (const platform of platforms) {
        const caption = input.captions[platform];
        if (!caption) throw new Error('A reviewed caption is missing.');
        const snapshot: SocialPostSnapshot = {
          productName: product.name, productUrl: product.productUrl, sourceImageUrl: product.imageUrl, imageUrl, caption,
          pageId, pageName: access.setup.pageName,
          ...(platform === 'instagram' && access.setup.instagram ? {
            instagramUserId: access.setup.instagram.id, instagramUsername: access.setup.instagram.username,
          } : {}),
        };
        const old = existing.find(post => post.platform === platform);
        if (old) await checkpoint(old, { request: snapshot });
        else {
          const { error } = await table().insert({ product_id: input.productId, platform, request: snapshot, requested_by: user.user.id });
          if (error) throw new Error('A post draft already exists or could not be saved. Refresh saved posts before continuing.');
        }
      }
      return json({ posts: await readPosts(input.productId) });
    }
    if (input.action === 'refresh') {
      const posts = await readPosts(input.productId);
      const refreshable = posts.filter(post => post.status !== 'draft' && post.status !== 'published'
        && (post.post_id || (post.platform === 'instagram' && post.container_id && !post.publish_started_at)));
      if (refreshable.length) {
        const access = await publishingAccess(config, pageId, refreshable.map(post => post.platform), enabled);
        for (const post of refreshable) {
          verifyPublishingIdentity(post, access);
          await checkpoint(post, post.post_id
            ? await readPublishedPost(post, access.config)
            : await containerStatus(post, access.config));
        }
      }
      return json({ posts: await readPosts(input.productId) });
    }
    if (!enabled) return json({ error: 'Organic publishing is disabled. The operator must enable it after publishing permissions and previews are verified.' }, 503);
    const { data: rows, error: rowsError } = await table().select(socialPostColumns).in('id', input.posts.map(post => post.id));
    if (rowsError || !Array.isArray(rows) || rows.length !== input.posts.length) throw new Error('Unable to read all reviewed posts. Refresh saved status.');
    const posts = rows.map(parseSocialPost);
    const productId = posts[0].product_id;
    if (posts.some(post => post.product_id !== productId || !['draft', 'ready'].includes(post.status)
      || post.publish_started_at !== null || post.revision !== input.posts.find(item => item.id === post.id)?.revision)
      || new Set(posts.map(post => post.platform)).size !== posts.length) {
      throw new Error('A post was changed or already attempted. Refresh and review the saved status; do not retry publishing.');
    }
    const product = await readProduct(productId);
    const access = await publishingAccess(config, pageId, posts.map(post => post.platform), enabled);
    for (const post of posts) {
      verifyPublishingIdentity(post, access);
      if (product.imageUrl !== post.request.sourceImageUrl || product.productUrl !== post.request.productUrl) {
        throw new Error('The product image or public URL changed after review. Do not publish this stale draft.');
      }
    }
    for (const original of posts) {
      let post = await checkpoint(original, {
        status: 'publishing', attempt_started_at: original.attempt_started_at ?? new Date().toISOString(),
        ...(original.platform === 'facebook' || original.status === 'ready'
          ? { publish_started_at: new Date().toISOString(), published_by: user.user.id } : {}),
      });
      try {
        if (post.platform === 'facebook') {
          post = await checkpoint(post, { post_id: await createFacebookPost(post, access.config) });
        } else {
          if (!post.container_id) post = await checkpoint(post, {
            container_id: await createInstagramContainer(post, access.config), status: 'processing',
          });
          const state = await containerStatus(post, access.config);
          if (state.status !== 'ready') {
            if (post.publish_started_at) throw new Error('The reviewed Instagram container is no longer ready. Inspect the profile; do not retry.');
            await checkpoint(post, state);
            continue;
          }
          if (!post.publish_started_at) {
            post = await checkpoint(post, { status: 'publishing', publish_started_at: new Date().toISOString(), published_by: user.user.id });
          }
          post = await checkpoint(post, { post_id: await publishInstagramContainer(post, access.config) });
        }
        await checkpoint(post, await readPublishedPost(post, access.config));
      } catch (error) {
        console.error('Organic publishing requires attention.', { platform: original.platform });
        await checkpoint(post, { status: 'needs_attention', error: failureMessage(error) });
      }
    }
    return json({ posts: await readPosts(productId) });
  } catch (error) {
    console.error('Social publishing request could not be completed.');
    return json({ error: failureMessage(error) }, 502);
  }
}

Deno.serve(handler);
