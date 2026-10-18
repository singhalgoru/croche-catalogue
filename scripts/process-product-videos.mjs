import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { AwsClient } from 'aws4fetch';
import { createVideoWatermark } from './video-watermark.mjs';
import { deleteVideoDraftAssets } from '../supabase/functions/_shared/productVideoStorage.js';

export const MAX_SOURCE_BYTES = 60 * 1024 * 1024;
const UUID = /^[0-9a-f-]{36}$/;
const MAX_OUTPUT_BYTES = 40 * 1024 * 1024;

export function runMediaTool(tool, args) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(tool, args, { shell: false, windowsHide: true, timeout: 120_000 });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > 1024 * 1024) child.kill();
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolveResult(stdout) :
      reject(new Error(`${tool} failed (${code}): ${stderr.slice(-1000)}`)));
  });
}

export function validateProbe(probe) {
  const video = probe.streams?.filter((stream) => stream.codec_type === 'video');
  const audio = probe.streams?.filter((stream) => stream.codec_type === 'audio') ?? [];
  const duration = Number(probe.format?.duration);
  if (!probe.format?.format_name?.split(',').includes('mp4') ||
      video?.length !== 1 || video[0].codec_name !== 'h264' ||
      audio.length > 1 || audio.some((stream) => stream.codec_name !== 'aac') ||
      probe.streams.some((stream) => !['video', 'audio'].includes(stream.codec_type)) ||
      !Number.isFinite(duration) || duration < 1 || duration > 60 ||
      !(video[0].width > 0 && video[0].height > 0) ||
      video[0].width > 4096 || video[0].height > 4096 ||
      video[0].disposition?.attached_pic) {
    throw new Error('Use a 1–60 second MP4 with H.264 video and optional AAC audio (maximum 4096px).');
  }
  return { duration, width: video[0].width, height: video[0].height };
}

export async function encodeVideo(input, output, poster, run = runMediaTool) {
  const probe = JSON.parse(await run('ffprobe', [
    '-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', '-of', 'json', input,
  ]));
  validateProbe(probe);
  const stream = probe.streams.find((value) => value.codec_type === 'video');
  const rotation = Number(stream.side_data_list?.find((value) => value.rotation !== undefined)?.rotation ?? stream.tags?.rotate ?? 0);
  const rotated = Math.abs(rotation) % 180 === 90;
  const [sarNumerator, sarDenominator] = String(stream.sample_aspect_ratio ?? '1:1').split(':').map(Number);
  const sar = sarNumerator > 0 && sarDenominator > 0 ? sarNumerator / sarDenominator : 1;
  const displayWidth = rotated ? stream.height : stream.width * sar;
  const displayHeight = rotated ? stream.width * sar : stream.height;
  const scale = Math.min(1280 / displayWidth, 720 / displayHeight);
  const badge = await createVideoWatermark(Math.max(2, Math.floor(displayWidth * scale / 2) * 2),
    Math.max(2, Math.floor(displayHeight * scale / 2) * 2));
  const badgePath = `${output}.watermark.png`;
  await writeFile(badgePath, badge.bytes);
  try {
    await run('ffmpeg', [
    '-nostdin', '-v', 'error', '-y', '-threads', '2', '-protocol_whitelist', 'file,pipe', '-i', input,
    '-i', badgePath, '-filter_complex_threads', '2',
    '-filter_complex', `[0:v:0]scale=w='max(2,if(gte(dar,16/9),1280,trunc(720*dar/2)*2))':h='max(2,if(gte(dar,16/9),trunc(1280/dar/2)*2,720))',setsar=1,fps=30[video];[video][1:v:0]overlay=main_w-overlay_w-${badge.margin}:main_h-overlay_h-${badge.margin}:format=auto,format=yuv420p[branded]`,
    '-map', '[branded]', '-map', '0:a:0?', '-map_metadata', '-1', '-map_metadata:s', '-1', '-map_chapters', '-1',
    '-c:v', 'libx264', '-threads', '2', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-movflags', '+faststart', '-t', '60', output,
    ]);
  } finally { await rm(badgePath, { force: true }); }
  await run('ffmpeg', [
    '-nostdin', '-v', 'error', '-y', '-threads', '2', '-protocol_whitelist', 'file,pipe',
    '-i', output, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '80', poster,
  ]);
  const result = JSON.parse(await run('ffprobe', [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', output,
  ]));
  return validateProbe(result);
}

async function checked(response, operation) {
  if (!response.ok) throw new Error(`${operation} failed (HTTP ${response.status}).`);
  return response;
}

export async function readBoundedBody(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (declared > maxBytes) throw new Error('Video exceeds the storage size limit.');
  if (!response.body) throw new Error('Video download returned an empty body.');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('Video exceeds the storage size limit.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

export async function processQueue(env = process.env, { encode = encodeVideo } = {}) {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ORIGINALS_BUCKET', 'R2_PUBLIC_URL'];
  for (const key of required) if (!env[key]) throw new Error(`Missing ${key}.`);
  if (env.R2_BUCKET === env.R2_ORIGINALS_BUCKET) throw new Error('Originals bucket must be private and separate.');
  const publicUrl = new URL(env.R2_PUBLIC_URL);
  if (publicUrl.protocol !== 'https:') throw new Error('R2_PUBLIC_URL must use HTTPS.');
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const r2 = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3', region: 'auto', retries: 1 });
  const objectUrl = (bucket, key) => `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${key}`;
  const rpc = async (name, args) => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
  };
  let failed = false;
  // Three sequential jobs per invocation; GitHub also serializes workflow invocations.
  for (let index = 0; index < 3; index++) {
    const [job] = await rpc('claim_product_video');
    if (!job) break;
    if (!UUID.test(job.id)) throw new Error('Invalid stored job ID.');
    const dir = resolve('.video-processing', job.id);
    await mkdir(dir, { recursive: true });
    const input = join(dir, 'original.mp4');
    const output = join(dir, 'video.mp4');
    const poster = join(dir, 'poster.webp');
    const finish = (args) => rpc('finish_product_video', {
      p_job_id: job.id, p_lease: job.lease, p_video_bytes: null,
      p_duration: null, p_width: null, p_height: null, ...args,
    });
    try {
      const response = await checked(await r2.fetch(objectUrl(env.R2_ORIGINALS_BUCKET,
        `making-videos/${job.id}/original.mp4`), { signal: AbortSignal.timeout(90_000) }), 'Private video download');
      const source = await readBoundedBody(response, MAX_SOURCE_BYTES);
      if (source.length !== job.source_bytes) throw new Error('Uploaded video size changed. Please upload again.');
      await writeFile(input, source);
      const info = await encode(input, output, poster);
      if ((await stat(output)).size > MAX_OUTPUT_BYTES) throw new Error('Optimized video is too large. Use a shorter video.');
      for (const [path, type] of [[output, 'video/mp4'], [poster, 'image/webp']]) {
        const key = `making-videos/${job.id}/${path === output ? 'video.mp4' : 'poster.webp'}`;
        await checked(await r2.fetch(objectUrl(env.R2_ORIGINALS_BUCKET, key), {
          method: 'PUT', body: await readFile(path), signal: AbortSignal.timeout(60_000),
          headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store' },
        }), 'Optimized video upload');
      }
      const staged = await finish({ p_video_bytes: (await stat(output)).size,
        p_duration: info.duration, p_width: info.width, p_height: info.height });
      console.log(`Video job ${job.id}: ${staged ? 'ready for private review' : 'cancelled'}`);
    } catch (error) {
      failed = true;
      // Tool errors may include local paths, but never URLs, signed credentials or uploaded filenames.
      const message = String(error.message || 'Video processing failed.').slice(0, 500);
      await finish({ p_error: message });
      console.error(`Video job ${job.id}: ${message}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  // Only explicit user discard tombstones authorize remote deletion. No retention policy.
  const { data: discarded, error } = await db.from('product_video_jobs').select('id,writer_active')
    .eq('status', 'discarding').limit(30);
  if (error) throw error;
  for (const job of discarded) {
    if (job.writer_active) continue;
    try {
      await deleteVideoDraftAssets(r2, objectUrl(env.R2_ORIGINALS_BUCKET, '').replace(/\/$/, ''),
        objectUrl(env.R2_BUCKET, '').replace(/\/$/, ''), job.id);
      await rpc('finish_product_video_discard', { p_job_id: job.id });
    } catch (cleanupError) {
      await rpc('finish_product_video_discard', { p_job_id: job.id, p_error: cleanupError.message });
      throw cleanupError;
    }
  }
  const { data: remaining, error: remainingError } = await db.from('product_video_jobs')
    .select('id').eq('status', 'queued').limit(1);
  if (remainingError) throw remainingError;
  // GitHub keeps one pending run per concurrency group. Chain only actual queued
  // work so bursts above three uploads drain without any recurring idle schedule.
  if (remaining.length) await rpc('request_product_video_processing');
  if (failed) throw new Error('One or more video jobs failed; details are visible in the admin and workflow log.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  processQueue().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
