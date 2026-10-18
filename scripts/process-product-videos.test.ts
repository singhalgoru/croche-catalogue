// @vitest-environment node
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import sharp from 'sharp';
import { encodeVideo, readBoundedBody, runMediaTool, validateProbe } from './process-product-videos.mjs';
import { createVideoWatermark, VIDEO_WATERMARK } from './video-watermark.mjs';

const dir = resolve('.video-processing', 'test-processor');
const probe = {
  format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '20' },
  streams: [{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 },
    { codec_type: 'audio', codec_name: 'aac' }],
};
beforeAll(async () => { await mkdir(dir, { recursive: true }); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

it('validates actual container, codecs, bounded duration, dimensions and stream counts', () => {
  expect(validateProbe(probe)).toEqual({ duration: 20, width: 1920, height: 1080 });
  for (const invalid of [
    { ...probe, format: { ...probe.format, duration: '61' } },
    { ...probe, format: { ...probe.format, duration: 'NaN' } },
    { ...probe, format: { ...probe.format, format_name: 'matroska,webm' } },
    { ...probe, streams: [{ ...probe.streams[0], codec_name: 'hevc' }] },
    { ...probe, streams: [{ ...probe.streams[0], width: 10000 }] },
    { ...probe, streams: [...probe.streams, { codec_type: 'subtitle' }] },
    { ...probe, streams: [probe.streams[0], { codec_type: 'audio', codec_name: 'mp3' }] },
  ]) expect(() => validateProbe(invalid)).toThrow('H.264');
});

it('bounds downloads even when the sender lies about Content-Length', async () => {
  await expect(readBoundedBody(new Response('123456', { headers: { 'content-length': '1' } }), 5))
    .rejects.toThrow('size limit');
  expect((await readBoundedBody(new Response('123'), 5)).toString()).toBe('123');
});

it('processes a real synthetic MP4 with FFmpeg into faststart H264/AAC and a WebP poster', async () => {
  const input = join(dir, 'original.mp4');
  const output = join(dir, 'video.mp4');
  const poster = join(dir, 'poster.webp');
  await runMediaTool('ffmpeg', ['-nostdin', '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=red:s=1920x1080:r=60',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
    '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac',
    '-metadata', 'comment=private-fixture', '-metadata:s:v:0', 'title=private-stream', input]);
  const result = await encodeVideo(input, output, poster);
  expect(result.width).toBe(1280);
  expect(result.height).toBe(720);
  expect(result.duration).toBeGreaterThanOrEqual(2);
  const mp4 = await readFile(output);
  expect(mp4.indexOf('moov')).toBeLessThan(mp4.indexOf('mdat'));
  const webp = await readFile(poster);
  expect(webp.subarray(8, 12).toString()).toBe('WEBP');
  const encoded = JSON.parse(await runMediaTool('ffprobe', [
    '-v', 'error', '-show_streams', '-of', 'json', output,
  ]));
  expect(encoded.streams[0].r_frame_rate).toBe('30/1');
  expect(encoded.streams[0].pix_fmt).toBe('yuv420p');
  expect(JSON.stringify(encoded)).not.toContain('private-stream');
  const format = JSON.parse(await runMediaTool('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', output]));
  expect(JSON.stringify(format)).not.toContain('private-fixture');
}, 120_000);

it('never passes user filenames through a shell and constrains input protocols', async () => {
  const calls: string[][] = [];
  await encodeVideo('untrusted;$(run).mp4', 'out.mp4', 'poster.webp', async (_tool: string, args: string[]) => {
    calls.push(args);
    return JSON.stringify(probe);
  });
  expect(calls[0]).toContain('file,pipe');
  expect(calls[1]).toContain('untrusted;$(run).mp4');
  expect(calls[1]).toContain('-map_metadata');
  expect(calls[1]).toContain('+faststart');
  expect(calls[1]).toContain('-filter_complex');
  expect(calls[1].some(value => value.includes('overlay=main_w-overlay_w'))).toBe(true);
});

it.each([
  { label: 'portrait', width: 540, height: 960, rotate: false, sar: 1 },
  { label: 'small landscape', width: 160, height: 90, rotate: false, sar: 1 },
  { label: 'rotated portrait recording', width: 360, height: 640, rotate: true, sar: 1 },
  { label: 'non-square pixels', width: 320, height: 240, rotate: false, sar: 2 },
])('bakes the matching Luvia badge into $label media and its poster without modifying the source', async ({ label, width, height, rotate, sar }) => {
  const base = join(dir, label.replaceAll(' ', '-'));
  const input = `${base}-source.mp4`;
  const output = `${base}-processed.mp4`;
  const poster = `${base}.webp`;
  await runMediaTool('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i',
    `color=c=red:s=${width}x${height}:r=24`, '-vf', `setsar=${sar}`, '-t', '1.1', '-c:v', 'libx264', '-preset', 'ultrafast', input]);
  let source = input;
  if (rotate) {
    source = `${base}-rotated.mp4`;
    await runMediaTool('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-display_rotation', '90', '-i', input,
      '-c', 'copy', source]);
  }
  const original = await readFile(source);
  const info = await encodeVideo(source, output, poster);
  expect(await readFile(source)).toEqual(original);
  expect(info.width <= 1280 && info.height <= 720).toBe(true);
  if (rotate || width > height) expect(info.width).toBeGreaterThan(info.height);
  else expect(info.width).toBeLessThan(info.height);
  const expectedAspect = rotate ? height / (width * sar) : width * sar / height;
  expect(Math.abs(info.width / info.height - expectedAspect)).toBeLessThan(0.01);
  const badge = await createVideoWatermark(info.width, info.height);
  expect(VIDEO_WATERMARK).toEqual({ size: 0.12, margin: 0.03, ring: 0.035, opacity: 0.7 });
  const posterBytes = await readFile(poster);
  const cornerBytes = await sharp(posterBytes).extract({
    left: info.width - badge.size - badge.margin, top: info.height - badge.size - badge.margin,
    width: badge.size, height: badge.size,
  }).toBuffer();
  const corner = await sharp(cornerBytes).stats();
  // The synthetic source is solid red; green/blue in this exact corner prove that
  // the logo is baked into the encoded video from which the poster was extracted.
  expect(corner.channels[1].mean).toBeGreaterThan(20);
  expect(corner.channels[2].mean).toBeGreaterThan(20);
  const untouched = await sharp(await sharp(posterBytes).extract({ left: 0, top: 0, width: 16, height: 16 }).toBuffer()).stats();
  expect(untouched.channels[1].mean).toBeLessThan(10);
}, 120_000);
