#!/usr/bin/env node
// One-time migration: copies product images from Supabase Storage to Cloudflare R2
// (full image + pre-sized w160/w480/w960 copies) and repoints database rows.
// Dry run by default; pass --apply to upload and update rows.
import { AwsClient } from 'aws4fetch';

const apply = process.argv.includes('--apply');
const env = (name, fallback) => process.env[name] || (fallback ? process.env[fallback] : undefined);

const supabaseUrl = env('SUPABASE_URL', 'VITE_SUPABASE_URL')?.replace(/\/+$/, '');
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
const accountId = env('R2_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID');
const accessKeyId = env('R2_ACCESS_KEY_ID');
const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
const bucket = env('R2_BUCKET');
const publicUrl = env('R2_PUBLIC_URL')?.replace(/\/+$/, '');

const missing = Object.entries({
  SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  R2_ACCOUNT_ID: accountId,
  R2_ACCESS_KEY_ID: accessKeyId,
  R2_SECRET_ACCESS_KEY: secretAccessKey,
  R2_BUCKET: bucket,
  R2_PUBLIC_URL: publicUrl,
}).filter(([, value]) => !value).map(([name]) => name);
if (missing.length) {
  console.error('Missing environment variables: ' + missing.join(', '));
  process.exit(1);
}

const r2 = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' });
const r2Endpoint = 'https://' + accountId + '.r2.cloudflarestorage.com/' + bucket;
const PUBLIC_PREFIX = '/storage/v1/object/public/product-images/';
const RENDER_PREFIX = '/storage/v1/render/image/public/product-images/';
const SIZES = [160, 480, 960];
const TABLES = ['products', 'product_variants', 'product_variant_images'];
const restHeaders = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey };

const rest = async (path, init = {}) => {
  const response = await fetch(supabaseUrl + '/rest/v1/' + path, {
    ...init,
    headers: { ...restHeaders, 'Content-Type': 'application/json', ...init.headers },
  });
  if (!response.ok) throw new Error('Supabase ' + path + ' failed: ' + response.status + ' ' + await response.text());
  return response.status === 204 ? null : response.json();
};

const fetchWebp = async (url) => {
  const response = await fetch(url, { headers: { Accept: 'image/webp' } });
  if (!response.ok) throw new Error('Download failed ' + response.status + ' for ' + url);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('image/webp')) throw new Error('Expected WebP but got ' + type + ' for ' + url);
  return new Uint8Array(await response.arrayBuffer());
};

const r2Exists = async (key) => (await r2.fetch(r2Endpoint + '/' + key, { method: 'HEAD' })).ok;

const r2Put = async (key, body) => {
  const response = await r2.fetch(r2Endpoint + '/' + key, {
    method: 'PUT',
    body,
    headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
  if (!response.ok) throw new Error('R2 upload failed ' + response.status + ' for ' + key + ': ' + await response.text());
};

const objectPathFromUrl = (imageUrl) => {
  try {
    const url = new URL(imageUrl);
    return url.pathname.startsWith(PUBLIC_PREFIX) ? decodeURIComponent(url.pathname.slice(PUBLIC_PREFIX.length)) : null;
  } catch {
    return null;
  }
};

const migrateObject = async (objectPath) => {
  const base = 'products/' + objectPath.replace(/\.[^./]+$/, '');
  const encoded = objectPath.split('/').map(encodeURIComponent).join('/');
  const originalUrl = supabaseUrl + PUBLIC_PREFIX + encoded;
  const renderUrl = (width, quality) =>
    supabaseUrl + RENDER_PREFIX + encoded + '?width=' + width + '&quality=' + quality + '&resize=contain';

  const jobs = [
    [base + '.webp', objectPath.toLowerCase().endsWith('.webp') ? originalUrl : renderUrl(1600, 82)],
    ...SIZES.map((size) => [base + '-w' + size + '.webp', renderUrl(size, 75)]),
  ];
  for (const [key, sourceUrl] of jobs) {
    if (await r2Exists(key)) continue;
    await r2Put(key, await fetchWebp(sourceUrl));
  }
  return { imagePath: 'r2:' + base, imageUrl: publicUrl + '/' + base + '.webp' };
};

const rowsByTable = {};
const objectPaths = new Set();
for (const table of TABLES) {
  rowsByTable[table] = await rest(table + '?select=id,image_path,image_url');
  for (const row of rowsByTable[table]) {
    if (String(row.image_path).startsWith('r2:')) continue;
    const objectPath = objectPathFromUrl(row.image_url);
    if (objectPath) objectPaths.add(objectPath);
    else console.warn('Skipping ' + table + ' ' + row.id + ': not a Supabase public image URL');
  }
}

console.log('Found ' + objectPaths.size + ' Supabase images to migrate' + (apply ? '.' : ' (dry run, pass --apply to migrate).'));
if (!apply) process.exit(0);

const migrated = new Map();
let index = 0;
for (const objectPath of objectPaths) {
  index += 1;
  try {
    migrated.set(objectPath, await migrateObject(objectPath));
    console.log('[' + index + '/' + objectPaths.size + '] ' + objectPath);
  } catch (error) {
    console.error('[' + index + '/' + objectPaths.size + '] FAILED ' + objectPath + ': ' + error.message);
  }
}

let updatedRows = 0;
for (const table of TABLES) {
  for (const row of rowsByTable[table]) {
    const objectPath = objectPathFromUrl(row.image_url);
    const target = objectPath && migrated.get(objectPath);
    if (!target || String(row.image_path).startsWith('r2:')) continue;
    await rest(table + '?id=eq.' + encodeURIComponent(row.id), {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ image_path: target.imagePath, image_url: target.imageUrl }),
    });
    updatedRows += 1;
  }
}

const cartItems = await rest('cart_items?select=id,image_url');
for (const item of cartItems) {
  const objectPath = objectPathFromUrl(item.image_url);
  const target = objectPath && migrated.get(objectPath);
  if (!target) continue;
  await rest('cart_items?id=eq.' + encodeURIComponent(item.id), {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ image_url: target.imageUrl }),
  });
  updatedRows += 1;
}

const failed = objectPaths.size - migrated.size;
console.log('Migrated ' + migrated.size + ' images, updated ' + updatedRows + ' rows' + (failed ? ', ' + failed + ' failed (rerun to retry).' : '.'));
console.log('Old Supabase objects were kept; delete them after verifying the site.');
if (failed) process.exit(1);
