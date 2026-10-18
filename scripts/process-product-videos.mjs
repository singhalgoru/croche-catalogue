import { spawn } from 'node:child_process';
import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { AwsClient } from 'aws4fetch';
import { createVideoWatermark } from './video-watermark.mjs';
import { deleteVideoDraftAssets } from '../supabase/functions/_shared/productVideoStorage.js';

export const MAX_SOURCE_BYTES = 500 * 1024 * 1024;
export const MAX_MUSIC_BYTES = 20 * 1024 * 1024;
const UUID = /^[0-9a-f-]{36}$/;
const MAX_OUTPUT_BYTES = 40 * 1024 * 1024;
// Private default (brand) track, installed once by the service-role-only
// install-brand-music edge action. Never public and never deleted by discard.
export const BRAND_MUSIC_KEY = 'making-video-music/luvia-gentle.wav';

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

export function validateMusicProbe(probe, type) {
  const formats = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };
  const audio = probe.streams?.[0];
  const duration = Number(probe.format?.duration);
  if (!formats[type] || !probe.format?.format_name?.split(',').includes(formats[type]) ||
      probe.streams?.length !== 1 || audio.codec_type !== 'audio' ||
      !['mp3', 'aac', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'pcm_u8'].includes(audio.codec_name) ||
      (type === 'audio/mpeg' && audio.codec_name !== 'mp3') ||
      (type === 'audio/mp4' && audio.codec_name !== 'aac') ||
      (formats[type] === 'wav' && !audio.codec_name.startsWith('pcm_')) ||
      !(audio.channels >= 1 && audio.channels <= 2) ||
      !(Number(audio.sample_rate) >= 8000 && Number(audio.sample_rate) <= 96000) ||
      !Number.isFinite(duration) || duration < 0.1 || duration > 600) {
    throw new Error('Music must be audio-only MP3, AAC M4A or PCM WAV, 0.1–600 seconds, mono/stereo, 8–96 kHz.');
  }
  return duration;
}

// Fit within 1280x720 (landscape) / 720px tall (portrait) without ever
// upscaling or cropping; dimensions are even for H.264 4:2:0.
export function outputSize(displayWidth, displayHeight) {
  const scale = Math.min(1, 1280 / displayWidth, 720 / displayHeight);
  const even = (value) => Math.max(2, Math.floor(value / 2 + 1e-6) * 2);
  return { width: even(displayWidth * scale), height: even(displayHeight * scale) };
}

export async function encodeVideo(input, output, poster, run = runMediaTool, music = undefined) {
  const probe = JSON.parse(await run('ffprobe', [
    '-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', '-of', 'json', input,
  ]));
  const { duration } = validateProbe(probe);
  if (music) {
    // Legacy rows may still say 'mix'; every supplied track now replaces source audio.
    const musicProbe = JSON.parse(await run('ffprobe', [
      '-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', '-of', 'json', music.path,
    ]));
    validateMusicProbe(musicProbe, music.type);
  }
  const fade = Math.min(0.5, duration / 4);
  // Source audio (speech, room noise, background sound) is never mapped. The
  // only possible output track is the supplied music.
  const musicFilter = music ? `;[2:a:0]aresample=48000,asetpts=N/SR/TB,atrim=duration=${duration},volume=0.15,afade=t=in:d=${fade},afade=t=out:st=${duration - fade}:d=${fade}[audio]` : '';
  const stream = probe.streams.find((value) => value.codec_type === 'video');
  const rotation = Number(stream.side_data_list?.find((value) => value.rotation !== undefined)?.rotation ?? stream.tags?.rotate ?? 0);
  const rotated = Math.abs(rotation) % 180 === 90;
  const [sarNumerator, sarDenominator] = String(stream.sample_aspect_ratio ?? '1:1').split(':').map(Number);
  const sar = sarNumerator > 0 && sarDenominator > 0 ? sarNumerator / sarDenominator : 1;
  const displayWidth = rotated ? stream.height : stream.width * sar;
  const displayHeight = rotated ? stream.width * sar : stream.height;
  const { width, height } = outputSize(displayWidth, displayHeight);
  const badge = await createVideoWatermark(width, height);
  const badgePath = `${output}.watermark.png`;
  await writeFile(badgePath, badge.bytes);
  try {
    await run('ffmpeg', [
    '-nostdin', '-v', 'error', '-y', '-threads', '2', '-protocol_whitelist', 'file,pipe', '-i', input,
    '-i', badgePath, ...(music ? ['-stream_loop', '-1', '-protocol_whitelist', 'file,pipe', '-i', music.path] : []),
    '-filter_complex_threads', '2',
    '-filter_complex', `[0:v:0]scale=${width}:${height},setsar=1,fps=30[video];[video][1:v:0]overlay=main_w-overlay_w-${badge.margin}:main_h-overlay_h-${badge.margin}:format=auto,format=yuv420p[branded]${musicFilter}`,
    '-map', '[branded]', ...(music ? ['-map', '[audio]', '-c:a', 'aac', '-b:a', '96k', '-ac', '2'] : ['-an']),
    '-map_metadata', '-1', '-map_metadata:s', '-1', '-map_chapters', '-1',
    '-c:v', 'libx264', '-threads', '2', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-t', music ? String(duration) : '60', output,
    ]);
  } finally { await rm(badgePath, { force: true }); }
  await run('ffmpeg', [
    '-nostdin', '-v', 'error', '-y', '-threads', '2', '-protocol_whitelist', 'file,pipe',
    '-i', output, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '80', poster,
  ]);
  const result = JSON.parse(await run('ffprobe', [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', output,
  ]));
  const info = validateProbe(result);
  const audioStreams = result.streams.filter((value) => value.codec_type === 'audio').length;
  if (audioStreams !== (music ? 1 : 0)) throw new Error('Processed video audio does not match the selected music.');
  return info;
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

export async function downloadToFile(response, path, maxBytes, expectedBytes, label = 'video') {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > maxBytes) {
    await response.body?.cancel();
    throw new Error(`Invalid stored ${label} size.`);
  }
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    await response.body?.cancel();
    throw new Error('Video exceeds the storage size limit.');
  }
  if (!response.body) throw new Error('Video download returned an empty body.');
  const reader = response.body.getReader();
  let file;
  let bytes = 0;
  let complete = false;
  try {
    file = await open(path, 'w');
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('Video exceeds the storage size limit.');
      if (bytes > expectedBytes) throw new Error(`Uploaded ${label} size changed. Please upload again.`);
      // Await disk writes before pulling again; only the current network chunk
      // is retained, even for a 500 MB original.
      await file.writeFile(value);
    }
    if (bytes !== expectedBytes || (declared !== null && Number(declared) !== bytes)) {
      throw new Error(`Uploaded ${label} size changed. Please upload again.`);
    }
    complete = true;
    return bytes;
  } finally {
    try { await reader.cancel(); } finally {
      try { await file?.close(); } finally {
        if (!complete) await rm(path, { force: true });
      }
    }
  }
}

export async function processQueue(env = process.env, { encode = encodeVideo } = {}) {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ORIGINALS_BUCKET', 'R2_PUBLIC_URL'];
  for (const key of required) if (!env[key]) throw new Error(`Missing ${key}.`);
  if (env.R2_BUCKET === env.R2_ORIGINALS_BUCKET || env.R2_VIDEO_BUCKET === env.R2_ORIGINALS_BUCKET) {
    throw new Error('Originals bucket must be private and separate.');
  }
  const publicUrl = new URL(env.R2_VIDEO_PUBLIC_URL || env.R2_PUBLIC_URL);
  if (publicUrl.protocol !== 'https:') throw new Error('The public video URL must use HTTPS.');
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
      await downloadToFile(response, input, MAX_SOURCE_BYTES, job.source_bytes);
      let music;
      if (job.music_source === 'brand') {
        const brandResponse = await r2.fetch(objectUrl(env.R2_ORIGINALS_BUCKET, BRAND_MUSIC_KEY),
          { signal: AbortSignal.timeout(90_000) });
        if (brandResponse.status === 404) {
          throw new Error('Default Luvia music is not installed. Install it, then reprocess the draft.');
        }
        await checked(brandResponse, 'Default music download');
        const path = join(dir, 'music.wav');
        await writeFile(path, await readBoundedBody(brandResponse, MAX_MUSIC_BYTES));
        // FFprobe in encodeVideo still validates the actual stored bytes as PCM WAV.
        music = { path, type: 'audio/wav' };
      } else if (job.music_bytes != null) {
        if (!Number.isSafeInteger(job.music_bytes) || job.music_bytes < 1 || job.music_bytes > MAX_MUSIC_BYTES) {
          throw new Error('Invalid stored music size.');
        }
        const musicResponse = await checked(await r2.fetch(objectUrl(env.R2_ORIGINALS_BUCKET,
          `making-videos/${job.id}/music.bin`), { signal: AbortSignal.timeout(90_000) }), 'Private music download');
        const path = join(dir, 'music.bin');
        await downloadToFile(musicResponse, path, MAX_MUSIC_BYTES, job.music_bytes, 'music');
        music = { path, type: job.music_type };
      }
      const info = await encode(input, output, poster, runMediaTool, music);
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
  // Only successfully published jobs qualify; private review drafts retain sources.
  const { data: processed, error: cleanupQueryError } = await db.from('product_video_jobs')
    .select('id').in('status', ['ready', 'replaced'])
    .is('original_deleted_at', null).limit(30);
  if (cleanupQueryError) throw cleanupQueryError;
  for (const job of processed) {
    if (!UUID.test(job.id)) throw new Error('Invalid stored job ID.');
    const url = objectUrl(env.R2_ORIGINALS_BUCKET, `making-videos/${job.id}/original.mp4`);
    const response = await r2.fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(30_000) });
    if (!response.ok && !(response.status === 404 && /<Code>NoSuchKey<\/Code>/.test(await response.text()))) {
      throw new Error(`Original video cleanup failed (HTTP ${response.status}). Retry processing workflow; processed video is safe.`);
    }
    const head = await r2.fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
    if (head.status !== 404) throw new Error(`Original video deletion could not be verified (HTTP ${head.status}).`);
    if (!await rpc('finish_product_video_original_cleanup', { p_job_id: job.id })) {
      throw new Error('Original video cleanup was not confirmed. Retry processing workflow.');
    }
    console.log(`Video job ${job.id}: original deleted; processed video and poster retained`);
  }
  // Discard still authorizes deletion of the other private/public draft assets.
  const { data: discarded, error } = await db.from('product_video_jobs').select('id,writer_active,original_upload_id')
    .eq('status', 'discarding').limit(30);
  if (error) throw error;
  for (const job of discarded) {
    if (job.writer_active) continue;
    try {
      await deleteVideoDraftAssets(r2, objectUrl(env.R2_ORIGINALS_BUCKET, '').replace(/\/$/, ''),
        [...new Set([env.R2_VIDEO_BUCKET || env.R2_BUCKET, env.R2_BUCKET])]
          .map(bucket => objectUrl(bucket, '').replace(/\/$/, '')), job.id, job.original_upload_id);
      if (!await rpc('finish_product_video_discard', { p_job_id: job.id })) {
        throw new Error('Draft cleanup was not confirmed. Retry discard cleanup.');
      }
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
  if (remaining.length || processed.length === 30) await rpc('request_product_video_processing');
  if (failed) throw new Error('One or more video jobs failed; details are visible in the admin and workflow log.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  processQueue().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
