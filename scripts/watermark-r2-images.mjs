#!/usr/bin/env node
// One-time job: stamps the Luvia badge (see src/utils/imageWatermark.ts) on
// product photos uploaded before uploads were watermarked in the browser.
//
// R2 objects are immutable and cached for a year, so each photo is re-uploaded
// under a new "<key>-wm" base and database rows are repointed in one
// transaction. The unwatermarked originals stay in the private backup repo.
//
//   node --env-file=.env.r2.local scripts/watermark-r2-images.mjs               dry run
//   node --env-file=.env.r2.local scripts/watermark-r2-images.mjs --apply       watermark + repoint
//   node --env-file=.env.r2.local scripts/watermark-r2-images.mjs --delete-old  remove replaced originals
//
// Database access goes through the linked Supabase CLI (`supabase link`).
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AwsClient } from 'aws4fetch';
import sharp from 'sharp';

const apply = process.argv.includes('--apply');
const deleteOld = process.argv.includes('--delete-old');

const env = (name, fallback) => process.env[name] || (fallback ? process.env[fallback] : undefined);
const accountId = env('R2_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID');
const accessKeyId = env('R2_ACCESS_KEY_ID');
const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
const bucket = env('R2_BUCKET');
const publicUrl = env('R2_PUBLIC_URL')?.replace(/\/+$/, '');
const missing = Object.entries({
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

// Keep in sync with src/utils/imageWatermark.ts.
const SIZE_RATIO = 0.12;
const MARGIN_RATIO = 0.03;
const RING_RATIO = 0.035;
const OPACITY = 0.7;
const SIZES = [160, 480, 960];
const SUFFIX = '-wm';
const TABLES = ['products', 'product_variants', 'product_variant_images'];
const LOGO = fileURLToPath(new URL('../public/images/luvia-logo-480.webp', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const r2 = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' });
const r2Endpoint = 'https://' + accountId + '.r2.cloudflarestorage.com/' + bucket;

const tempDir = mkdtempSync(join(tmpdir(), 'luvia-watermark-'));
process.on('exit', () => rmSync(tempDir, { recursive: true, force: true }));

const runSql = (sql) => {
  const file = join(tempDir, 'query.sql');
  writeFileSync(file, sql);
  const output = execSync(`npx --yes supabase db query --linked --output-format json -f "${file}"`, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  const start = output.indexOf('{');
  return start === -1 ? [] : JSON.parse(output.slice(start)).rows ?? [];
};

const sqlText = (value) => "'" + String(value).replace(/'/g, "''") + "'";

const r2Exists = async (key) => (await r2.fetch(r2Endpoint + '/' + key, { method: 'HEAD' })).ok;

const r2Get = async (key) => {
  const response = await r2.fetch(r2Endpoint + '/' + key);
  if (!response.ok) throw new Error('R2 download failed ' + response.status + ' for ' + key);
  return Buffer.from(await response.arrayBuffer());
};

const r2Put = async (key, body) => {
  const response = await r2.fetch(r2Endpoint + '/' + key, {
    method: 'PUT',
    body,
    headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
  if (!response.ok) throw new Error('R2 upload failed ' + response.status + ' for ' + key + ': ' + await response.text());
};

const r2Delete = async (key) => {
  const response = await r2.fetch(r2Endpoint + '/' + key, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) throw new Error('R2 delete failed ' + response.status + ' for ' + key);
};

const objectKeys = (base) => [base + '.webp', ...SIZES.map((size) => base + '-w' + size + '.webp')];

const badgeCache = new Map();
const renderBadge = async (size, ring) => {
  const cacheKey = size + ':' + ring;
  if (badgeCache.has(cacheKey)) return badgeCache.get(cacheKey);
  const inner = size - ring * 2;
  const circle = (diameter) =>
    Buffer.from(`<svg width="${diameter}" height="${diameter}"><circle cx="${diameter / 2}" cy="${diameter / 2}" r="${diameter / 2}" fill="#fff"/></svg>`);
  const logo = await sharp(LOGO).resize(inner, inner, { fit: 'fill' })
    .composite([{ input: circle(inner), blend: 'dest-in' }]).png().toBuffer();
  const opaque = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: circle(size) }, { input: logo, left: ring, top: ring }]).png().toBuffer();
  const badge = await sharp(opaque).ensureAlpha().linear([1, 1, 1, OPACITY], [0, 0, 0, 0]).png().toBuffer();
  badgeCache.set(cacheKey, badge);
  return badge;
};

const watermark = async (input) => {
  const image = sharp(input).rotate();
  const { width, height } = await image.metadata();
  const shortSide = Math.min(width, height);
  const size = Math.round(shortSide * SIZE_RATIO);
  const margin = Math.round(shortSide * MARGIN_RATIO);
  const ring = Math.max(2, Math.round(size * RING_RATIO));
  if (size < 16) return image.webp({ quality: 82 }).toBuffer();
  return image
    .composite([{ input: await renderBadge(size, ring), left: width - size - margin, top: height - size - margin }])
    .webp({ quality: 82 })
    .toBuffer();
};

const readRows = () => runSql(
  TABLES.map((table) => `select '${table}' as tbl, id::text as id, image_path, image_url from public.${table}`).join(' union all ') +
  " union all select 'cart_items', id::text, null, image_url from public.cart_items",
);

const rows = readRows();
const baseOf = (imagePath) => String(imagePath).startsWith('r2:') ? String(imagePath).slice(3) : null;

if (deleteOld) {
  const referenced = new Set(rows.map((row) => baseOf(row.image_path)).filter(Boolean));
  const referencedUrls = new Set(rows.map((row) => row.image_url));
  const candidates = [...referenced].filter((base) => base.endsWith(SUFFIX)).map((base) => base.slice(0, -SUFFIX.length))
    .filter((base) => !referenced.has(base) && !referencedUrls.has(publicUrl + '/' + base + '.webp'));
  console.log('Found ' + candidates.length + ' replaced originals to delete.');
  for (const base of candidates) {
    for (const key of objectKeys(base)) await r2Delete(key);
    console.log('Deleted ' + base);
  }
  process.exit(0);
}

const pending = [...new Set(
  rows.filter((row) => row.tbl !== 'cart_items').map((row) => baseOf(row.image_path))
    .filter((base) => base && !base.endsWith(SUFFIX)),
)];
const skipped = rows.filter((row) => row.tbl !== 'cart_items' && !baseOf(row.image_path));
for (const row of skipped) console.warn('Skipping ' + row.tbl + ' ' + row.id + ': not stored on R2 (' + row.image_path + ')');

console.log('Found ' + pending.length + ' photos without the watermark' + (apply ? '.' : ' (dry run, pass --apply to watermark).'));
if (!apply || pending.length === 0) process.exit(0);

const done = [];
let index = 0;
for (const base of pending) {
  index += 1;
  const target = base + SUFFIX;
  try {
    const [fullKey, ...sizeKeys] = objectKeys(target);
    if (!(await r2Exists(fullKey)) || !(await Promise.all(sizeKeys.map(r2Exists))).every(Boolean)) {
      const full = await watermark(await r2Get(base + '.webp'));
      for (let i = 0; i < SIZES.length; i += 1) {
        const resized = await sharp(full).resize({ width: SIZES[i], withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
        await r2Put(sizeKeys[i], resized);
      }
      // Full image last, so its presence means the set is complete.
      await r2Put(fullKey, full);
    }
    done.push(base);
    console.log('[' + index + '/' + pending.length + '] ' + target);
  } catch (error) {
    console.error('[' + index + '/' + pending.length + '] FAILED ' + base + ': ' + error.message);
  }
}

if (done.length) {
  const pathValues = done.map((base) =>
    `(${sqlText('r2:' + base)}, ${sqlText('r2:' + base + SUFFIX)}, ${sqlText(publicUrl + '/' + base + SUFFIX + '.webp')})`).join(',\n');
  const urlValues = done.map((base) =>
    `(${sqlText(publicUrl + '/' + base + '.webp')}, ${sqlText(publicUrl + '/' + base + SUFFIX + '.webp')})`).join(',\n');
  // One statement per table, so each table's site-rebuild trigger fires once.
  runSql([
    'begin;',
    ...TABLES.map((table) =>
      `update public.${table} t set image_path = m.new_path, image_url = m.new_url
       from (values ${pathValues}) as m(old_path, new_path, new_url) where t.image_path = m.old_path;`),
    `update public.cart_items t set image_url = m.new_url
     from (values ${urlValues}) as m(old_url, new_url) where t.image_url = m.old_url;`,
    'commit;',
  ].join('\n'));
}

const failed = pending.length - done.length;
console.log('Watermarked ' + done.length + ' photos and repointed their rows' + (failed ? ', ' + failed + ' failed (rerun to retry).' : '.'));
console.log('After checking the site, run with --delete-old to remove the unwatermarked originals from R2.');
if (failed) process.exit(1);
