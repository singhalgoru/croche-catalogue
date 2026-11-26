import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { parseInstagramFeedResponse } from '../supabase/functions/_shared/instagramFeed.ts';

const origin = 'https://luviacreations.com';
const directory = '/instagram-snapshot/';
const maxAge = 48 * 60 * 60 * 1000;
const maxBytes = 10 * 1024 * 1024;
const mediaPlaceholder = 'https://cdninstagram.com/snapshot';

async function download(url, limit = maxBytes) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new Error('Instagram image exceeds size limit.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

function parseSnapshot(value, now) {
  if (!value || !Array.isArray(value.posts)) throw new Error('Invalid Instagram snapshot.');
  const urls = value.posts.map(post => post?.previewUrl);
  if (urls.some((url, index) => url !== `${directory}${value.posts[index]?.id}.webp`
    || !/^\/instagram-snapshot\/\d{1,30}\.webp$/.test(url))) {
    throw new Error('Invalid Instagram snapshot image.');
  }
  const parsed = parseInstagramFeedResponse({
    ...value, posts: value.posts.map(post => ({ ...post, previewUrl: mediaPlaceholder })),
  }, now);
  if (Date.parse(parsed.fetchedAt) > now + 5 * 60 * 1000 || now - Date.parse(parsed.fetchedAt) > maxAge) {
    throw new Error('Instagram snapshot is too old.');
  }
  return { ...parsed, posts: parsed.posts.map(post => ({
    ...post, previewUrl: `${directory}${post.id}.webp`,
  })) };
}

export async function buildInstagramSnapshot(supabaseUrl, anonKey, dist, now = Date.now()) {
  let previousPromise;
  const previous = () => {
    if (!previousPromise) previousPromise = download(`${origin}${directory}feed.json`, 256 * 1024)
      .then(data => parseSnapshot(JSON.parse(data.toString('utf8')), now))
      .catch(error => {
        console.warn(`[instagram] Previous snapshot unavailable: ${error.message}`);
        return null;
      });
    return previousPromise;
  };
  let feed;
  try {
    const response = await fetch(new URL('/functions/v1/instagram-feed', supabaseUrl), {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    feed = parseInstagramFeedResponse(await response.json(), now);
    if (feed.stale || Date.parse(feed.fetchedAt) > now + 5 * 60 * 1000 || now - Date.parse(feed.fetchedAt) > maxAge) {
      throw new Error('Instagram feed is stale.');
    }
  } catch (error) {
    console.warn(`[instagram] Live feed unavailable: ${error.message}`);
    feed = await previous();
    if (!feed) {
      console.warn('[instagram] No recent snapshot available; publishing without Instagram cards.');
      return null;
    }
    feed = { ...feed, stale: true };
  }

  const target = path.join(dist, 'instagram-snapshot');
  await mkdir(target, { recursive: true });
  const posts = [];
  for (const post of feed.posts) {
    try {
      let image;
      if (post.previewUrl.startsWith(directory)) {
        image = await download(`${origin}${post.previewUrl}`);
      } else {
        try {
          image = await download(post.previewUrl);
        } catch (error) {
          const old = await previous();
          const match = old?.posts.find(item => item.id === post.id && item.permalink === post.permalink);
          if (!match) throw error;
          console.warn(`[instagram] Using saved image for ${post.id}: ${error.message}`);
          image = await download(`${origin}${match.previewUrl}`);
        }
      }
      const output = await sharp(image, { limitInputPixels: 40_000_000 })
        .rotate().resize(480, 600, { fit: 'cover' }).webp({ quality: 78 }).toBuffer();
      await writeFile(path.join(target, `${post.id}.webp`), output);
      posts.push({ ...post, previewUrl: `${directory}${post.id}.webp` });
    } catch (error) {
      console.warn(`[instagram] Skipping post ${post.id}: ${error.message}`);
    }
  }
  const snapshot = { ...feed, posts };
  await writeFile(path.join(target, 'feed.json'), JSON.stringify(snapshot));
  return snapshot;
}
