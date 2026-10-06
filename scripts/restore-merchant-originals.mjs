import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';
import sharp from 'sharp';
import { loadEnv } from 'vite';
import { fetchProducts } from './prerender.mjs';
import { merchantItems } from './merchant-feed.mjs';

const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
const backup = process.argv.find((arg) => arg.startsWith('--backup='))?.slice('--backup='.length);
if (!backup || !path.isAbsolute(backup)) throw new Error('Supply an absolute --backup= path to the verified pre-watermark backup');
for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ORIGINALS_BUCKET']) {
  if (!env[name]) throw new Error(`Missing ${name}`);
}
const r2 = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' });
const items = merchantItems(await fetchProducts(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY));
const pending = [];
for (const key of new Set(items.flatMap((item) => [item.cleanKey, ...item.additionalCleanKeys]))) {
  const url = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_ORIGINALS_BUCKET}/${key}`;
  const head = await r2.fetch(url, { method: 'HEAD' });
  if (head.ok) continue;
  if (head.status !== 404) throw new Error(`R2 HEAD failed (${head.status}): ${key}`);
  const input = await readFile(path.join(backup, 'r2-images', 'products', key.replace('/original.webp', '.webp')));
  const metadata = await sharp(input).metadata();
  if (metadata.format !== 'webp') throw new Error(`Backup source is not processed WebP: ${key}`);
  const data = Math.max(metadata.width, metadata.height) <= 1600 ? input :
    await sharp(input).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  pending.push({ key, url, data });
}
console.log(`Verified ${pending.length} clean WebP backups. Existing originals will not be overwritten.`);
if (process.argv.includes('--apply')) {
  for (const { key, url, data } of pending) {
    const response = await r2.fetch(url, {
      method: 'PUT', body: data,
      headers: { 'Content-Type': 'image/webp', 'If-None-Match': '*' },
    });
    if (!response.ok) throw new Error(`Private R2 restore failed (${response.status}): ${key}`);
    const check = await r2.fetch(url);
    if (!check.ok || !Buffer.from(await check.arrayBuffer()).equals(data)) throw new Error(`Private R2 verification failed: ${key}`);
  }
  console.log(`Restored and byte-verified ${pending.length} private clean originals.`);
} else {
  console.log('Dry run only. Add --apply to restore these files to private R2.');
}
