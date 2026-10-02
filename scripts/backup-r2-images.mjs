/**
 * Copies every object in the R2 image bucket to a local folder.
 *
 *   node --env-file=.env.r2.local scripts/backup-r2-images.mjs [destination]
 *
 * Destination defaults to `r2-image-backup/` (gitignored). Point it at a
 * OneDrive or Google Drive folder to keep an off-site copy. Image keys are
 * never overwritten, so files already in the destination with the same size
 * are skipped and repeat runs only download new uploads. Nothing is ever
 * deleted locally, so images removed in admin stay in the backup.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AwsClient } from 'aws4fetch';

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error('Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET (see .env.r2.local).');
  process.exit(1);
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.resolve(process.argv[2] ?? path.join(rootDir, 'r2-image-backup'));
const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`;
const r2 = new AwsClient({
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  service: 's3',
  region: 'auto',
});

const decodeXml = (value) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const listObjects = async () => {
  const objects = [];
  let token = null;
  do {
    const query = new URLSearchParams({ 'list-type': '2', 'max-keys': '1000' });
    if (token) query.set('continuation-token', token);
    const response = await r2.fetch(`${endpoint}?${query}`);
    if (!response.ok) throw new Error(`Listing failed with status ${response.status}: ${await response.text()}`);
    const xml = await response.text();
    for (const [, block] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = decodeXml(block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? '');
      const size = Number(block.match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0);
      if (key) objects.push({ key, size });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? decodeXml(xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ?? '')
      : null;
  } while (token);
  return objects;
};

const localSize = async (file) => {
  try {
    return (await stat(file)).size;
  } catch {
    return -1;
  }
};

const objects = await listObjects();
let downloaded = 0;
let downloadedBytes = 0;
let failed = 0;

for (const { key, size } of objects) {
  const file = path.join(destination, ...key.split('/'));
  if (!file.startsWith(destination + path.sep)) {
    console.warn(`Skipping unsafe key: ${key}`);
    continue;
  }
  if ((await localSize(file)) === size) continue;

  const response = await r2.fetch(`${endpoint}/${key.split('/').map(encodeURIComponent).join('/')}`);
  if (!response.ok) {
    console.warn(`Failed ${key}: status ${response.status}`);
    failed += 1;
    continue;
  }
  const body = Buffer.from(await response.arrayBuffer());
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
  downloaded += 1;
  downloadedBytes += body.length;
}

const totalMb = (objects.reduce((sum, object) => sum + object.size, 0) / 1024 / 1024).toFixed(1);
console.log(
  `${objects.length} objects in R2 (${totalMb} MB). Downloaded ${downloaded} new ` +
    `(${(downloadedBytes / 1024 / 1024).toFixed(1)} MB) to ${destination}.` +
    (failed ? ` ${failed} failed; run again to retry.` : ''),
);
if (failed) process.exitCode = 1;
