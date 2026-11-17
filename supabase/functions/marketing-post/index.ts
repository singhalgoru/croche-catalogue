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
  publishingAccess, readPublishedPost, verifyPublishingIdentity, instagramChildrenStatus,
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
  let images: File[] = [];
  try {
    if (Number(request.headers.get('Content-Length')) > 9 * 1024 * 1024 + 65536) throw new Error('The prepared media request is too large.');
    if (request.headers.get('Content-Type')?.includes('multipart/form-data')) {
      const form = await request.formData();
      const files = form.getAll('image');
      if ([...form.keys()].some(field => field !== 'input' && field !== 'image') || form.getAll('input').length !== 1
        || files.length < 1 || files.length > 10) {
        throw new Error('Upload one to ten prepared JPEGs and their post details.');
      }
      const metadata = form.get('input');
      if (typeof metadata !== 'string' || metadata.length > 40000 || !files.every((file): file is File =>
        file instanceof File && file.type === 'image/jpeg' && file.size > 0 && file.size <= 8 * 1024 * 1024)) {
        throw new Error('Upload prepared JPEGs up to 8 MB each.');
      }
      if (files.reduce((total, file) => total + file.size, 0) > 9 * 1024 * 1024) throw new Error('Prepared JPEGs must total at most 9 MB.');
      input = parsePostInput(JSON.parse(metadata));
      if (input.action !== 'prepare') throw new Error('Image uploads are only allowed when preparing post previews.');
      if (files.length !== (input.sourceImageUrls?.length ?? 1)) throw new Error('Upload one JPEG for each selected source image in the same order.');
      images = files;
    } else {
      const text = await request.text();
      if (text.length > 20000) throw new Error('The social publishing request is too large.');
      input = parsePostInput(JSON.parse(text));
      if (input.action === 'prepare' && input.mediaType !== 'video') throw new Error('Preparing a photo post requires its JPEG preview upload.');
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
    const { data, error } = await service.from('products')
      .select('id,name,public_slug,image_url,published,product_variants(image_url,product_variant_images(image_url)),product_making_videos(video_url,poster_url,duration_seconds,width,height,title)')
      .eq('id', productId).maybeSingle();
    if (error) throw new Error('Unable to verify the published product.');
    if (!socialRecord(data) || data.published !== true || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 300
      || typeof data.public_slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,199}$/.test(data.public_slug) || !socialHttpsUrl(data.image_url)) {
      throw new Error('Select a currently published product with a public product page and image.');
    }
    if (!Array.isArray(data.product_variants)) throw new Error('Unable to verify the product image gallery.');
    const imageUrls = new Set([data.image_url]);
    for (const variant of data.product_variants) {
      if (!socialRecord(variant) || !Array.isArray(variant.product_variant_images)) throw new Error('Unable to verify the product image gallery.');
      if (socialHttpsUrl(variant.image_url)) imageUrls.add(variant.image_url);
      for (const image of variant.product_variant_images) {
        if (socialRecord(image) && socialHttpsUrl(image.image_url)) imageUrls.add(image.image_url);
      }
    }
    const videoRow = Array.isArray(data.product_making_videos) ? data.product_making_videos[0] : data.product_making_videos;
    let makingVideo: { videoUrl: string; posterUrl: string; durationSeconds: number; width: number; height: number } | undefined;
    if (videoRow !== null && videoRow !== undefined) {
      if (!socialRecord(videoRow) || !socialHttpsUrl(videoRow.video_url) || !socialHttpsUrl(videoRow.poster_url)
        || typeof videoRow.duration_seconds !== 'number' || videoRow.duration_seconds < 1 || videoRow.duration_seconds > 60
        || !Number.isSafeInteger(videoRow.width) || videoRow.width < 2
        || !Number.isSafeInteger(videoRow.height) || videoRow.height < 2) {
        throw new Error('The product making video metadata is invalid. Refresh product media before posting.');
      }
      makingVideo = { videoUrl: videoRow.video_url, posterUrl: videoRow.poster_url,
        durationSeconds: videoRow.duration_seconds, width: videoRow.width, height: videoRow.height };
    }
    return { name: data.name, imageUrls, productUrl: `https://luviacreations.com/p/${data.public_slug}/`, makingVideo };
  };
  try {
    const pageId = env('META_PAGE_ID')?.trim();
    if (!socialNumericId(pageId)) throw new Error('The Meta publishing Page is not configured.');
    const enabled = env('META_ORGANIC_PUBLISHING_ENABLED') === 'true';
    const { config } = await loadMetaAccess(env);
    if (input.action === 'setup') {
      const access = await publishingAccess(config, pageId, input.platforms, enabled, fetch, env('META_APP_ID')?.trim());
      return json({ setup: access.setup });
    }
    if (input.action === 'prepare') {
      if (input.mediaType === 'video' ? images.length !== 0 : !images.length) {
        throw new Error('Prepare a photo post with JPEG previews or a video post without photo uploads.');
      }
      const product = await readProduct(input.productId);
      const sources = input.sourceImageUrls ?? [input.sourceImageUrl];
      if (sources.some(source => !product.imageUrls.has(source))) throw new Error('A selected product image changed or does not belong to this product. Prepare new previews.');
      if ((input.mediaType === 'video' || input.mediaType === 'mixed') && (!product.makingVideo || input.videoUrl !== product.makingVideo.videoUrl)) {
        throw new Error('The making video is no longer published for this product. Refresh product media before preparing the post.');
      }
      const platforms = Object.keys(input.captions).filter((platform): platform is SocialPlatform => platform === 'facebook' || platform === 'instagram');
      if ((input.mediaType === 'video' || input.mediaType === 'mixed') && platforms.includes('instagram') && (product.makingVideo?.durationSeconds ?? 0) < 3) {
        throw new Error('Instagram video posts require a video of at least 3 seconds. Choose a longer making video or post photos instead.');
      }
      const existing = await readPosts(input.productId);
      if (existing.some(post => platforms.includes(post.platform) && post.status !== 'draft' && post.status !== 'published')) {
        throw new Error('A selected platform already has a publishing attempt for this product. Refresh its status; do not prepare a duplicate.');
      }
      for (const platform of platforms) {
        const replacesPostId = input.replacesPostIds?.[platform];
        if (replacesPostId && !existing.some(post => post.id === replacesPostId && post.platform === platform && post.status === 'published')) {
          throw new Error('The original replacement post must be a verified published post for this product and platform.');
        }
      }
      const access = await publishingAccess(config, pageId, platforms, enabled, fetch, env('META_APP_ID')?.trim());
      if (input.mediaType === 'video' && platforms.includes('facebook') && !access.videoUpload) {
        throw new Error('Facebook video upload is not configured. Contact the site operator before preparing this post.');
      }
      if (input.pageId !== pageId || (platforms.includes('instagram') && input.instagramUserId !== access.setup.instagram?.id)) {
        throw new Error('The publishing identity changed. Check publishing access again before preparing the preview.');
      }
      const imageUrls: string[] = [];
      if (input.mediaType !== 'video') {
        for (const image of images) imageUrls.push(await storePostImage(env, input.productId, new Uint8Array(await image.arrayBuffer())));
      }
      for (const platform of platforms) {
        const caption = input.captions[platform];
        if (!caption) throw new Error('A reviewed caption is missing.');
        const snapshot: SocialPostSnapshot = {
          productName: product.name, productUrl: product.productUrl,
          sourceImageUrl: input.mediaType === 'video' ? input.sourceImageUrl : sources[0],
          imageUrl: input.mediaType === 'video' ? product.makingVideo!.posterUrl : imageUrls[0], caption,
          ...(input.mediaType === 'video' ? { mediaType: 'video' as const, videoUrl: product.makingVideo!.videoUrl } : {}),
          ...(input.mediaType === 'mixed' ? { mediaType: 'mixed' as const, videoUrl: product.makingVideo!.videoUrl,
            videoPosterUrl: product.makingVideo!.posterUrl } : {}),
          ...(input.replacesPostIds?.[platform] ? { replacesPostId: input.replacesPostIds[platform] } : {}),
          ...(input.sourceImageUrls ? { sourceImageUrls: sources, imageUrls } : {}),
          pageId, pageName: access.setup.pageName,
          ...(platform === 'instagram' && access.setup.instagram ? {
            instagramUserId: access.setup.instagram.id, instagramUsername: access.setup.instagram.username,
          } : {}),
        };
        const old = existing.find(post => post.platform === platform && post.status === 'draft');
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
        && (post.post_id || (post.platform === 'instagram' && !post.publish_started_at
          && (post.container_id || ((post.status === 'processing' || post.status === 'ready')
            && post.request.mediaType === 'mixed' && post.request.childMediaIds?.length)))));
      if (refreshable.length) {
        const access = await publishingAccess(config, pageId, refreshable.map(post => post.platform), enabled, fetch, env('META_APP_ID')?.trim());
        for (const post of refreshable) {
          verifyPublishingIdentity(post, access);
          await checkpoint(post, post.post_id
            ? await readPublishedPost(post, access.config)
            : post.container_id ? await containerStatus(post, access.config) : await instagramChildrenStatus(post, access.config));
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
    const access = await publishingAccess(config, pageId, posts.map(post => post.platform), enabled, fetch, env('META_APP_ID')?.trim());
    for (const post of posts) {
      verifyPublishingIdentity(post, access);
      if ((post.request.sourceImageUrls ?? [post.request.sourceImageUrl]).some(source => !product.imageUrls.has(source))
        || product.productUrl !== post.request.productUrl
        || ((post.request.mediaType === 'video' || post.request.mediaType === 'mixed') && product.makingVideo?.videoUrl !== post.request.videoUrl)) {
        throw new Error('The product media or public URL changed after review. Do not publish this stale draft.');
      }
      if (post.platform === 'facebook' && post.request.mediaType === 'video' && !access.videoUpload) {
        throw new Error('Facebook video upload is not configured. Contact the site operator before publishing.');
      }
    }
    for (const original of posts) {
      let post = await checkpoint(original, {
        status: 'publishing', attempt_started_at: original.attempt_started_at ?? new Date().toISOString(),
        ...(original.platform === 'facebook' || (original.status === 'ready' && original.container_id)
          ? { publish_started_at: new Date().toISOString(), published_by: user.user.id } : {}),
      });
      try {
        const saveChildren = async (childMediaIds: string[]) => {
          post = await checkpoint(post, { request: { ...post.request, childMediaIds } });
        };
        if (post.platform === 'facebook') {
          const postId = await createFacebookPost(post, access.config, fetch, saveChildren, access.videoUpload);
          post = await checkpoint(post, { post_id: postId });
        } else {
          if (!post.container_id) {
            const containerId = await createInstagramContainer(post, access.config, fetch, saveChildren);
            if (!containerId) {
              await checkpoint(post, { status: 'processing' });
              continue;
            }
            post = await checkpoint(post, { container_id: containerId, status: 'processing' });
          }
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
