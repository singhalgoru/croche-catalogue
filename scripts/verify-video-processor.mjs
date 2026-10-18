import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { AwsClient } from 'aws4fetch';
import { encodeVideo, readBoundedBody, runMediaTool } from './process-product-videos.mjs';

// Deliberately no database client: never claim or modify a concurrent admin job.
const env = process.env;
for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ORIGINALS_BUCKET', 'R2_BUCKET']) {
  if (!env[key]) throw new Error(`Missing ${key}.`);
}
if (env.R2_BUCKET === env.R2_ORIGINALS_BUCKET) throw new Error('Private and public buckets must differ.');
const prefix = `making-video-smoke/${randomUUID()}`;
const dir = resolve('.video-processing', prefix.split('/')[1]);
const r2 = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  service: 's3', region: 'auto', retries: 0 });
const request = (key, options = {}) => r2.fetch(
  `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_ORIGINALS_BUCKET}/${prefix}/${key}`,
  { ...options, signal: AbortSignal.timeout(20_000) });
const owned = [];
let failure;
console.log(`Private processor smoke namespace: ${prefix}`);
await mkdir(dir, { recursive: true });
try {
  const generated = join(dir, 'generated.mp4');
  const source = join(dir, 'original.mp4');
  const video = join(dir, 'video.mp4');
  const poster = join(dir, 'poster.webp');
  await runMediaTool('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i',
    'color=c=tan:s=160x120:r=15', '-t', '1.2', '-c:v', 'libx264', '-threads', '2',
    '-pix_fmt', 'yuv420p', generated]);
  async function put(key, bytes, type) {
    owned.push(key);
    const response = await request(key, { method: 'PUT', body: bytes,
      headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store' } });
    if (!response.ok) throw new Error(`Private ${key} PUT failed (HTTP ${response.status}).`);
  }
  async function download(key) {
    const response = await request(key);
    if (!response.ok) throw new Error(`Private ${key} GET failed (HTTP ${response.status}).`);
    return readBoundedBody(response, 4 * 1024 * 1024);
  }
  const original = await readFile(generated);
  await put('original.mp4', original, 'video/mp4');
  const downloaded = await download('original.mp4');
  if (!original.equals(downloaded)) throw new Error('Private source bytes changed.');
  await writeFile(source, downloaded);
  const metadata = await encodeVideo(source, video, poster);
  if (!(metadata.duration >= 1 && metadata.duration <= 2)) throw new Error('Unexpected encoded duration.');
  for (const [key, path, type] of [['video.mp4', video, 'video/mp4'], ['poster.webp', poster, 'image/webp']]) {
    const bytes = await readFile(path);
    await put(key, bytes, type);
    if (!bytes.equals(await download(key))) throw new Error(`${key} round-trip mismatch.`);
  }
  console.log('Actual private download → branded FFmpeg encoding → private MP4/poster upload and byte verification passed.');
} catch (error) { failure = error; }
  for (const key of owned.reverse()) {
    try {
      const response = await request(key, { method: 'DELETE' });
      if (!response.ok) throw new Error(`DELETE HTTP ${response.status}`);
      if ((await request(key, { method: 'HEAD' })).status !== 404) throw new Error('HEAD did not confirm deletion');
      console.log(`Deleted private exact key ${prefix}/${key}`);
    } catch (error) {
      console.error(`Cleanup failed for private exact key ${prefix}/${key}: ${error.message}`);
      failure ||= new Error('Private smoke cleanup failed; retry exact keys shown above.');
    }
  }
await rm(dir, { recursive: true, force: true });
if (failure) throw failure;
console.log('Processor smoke completed; no database jobs, product fields, publication or public objects were touched.');
