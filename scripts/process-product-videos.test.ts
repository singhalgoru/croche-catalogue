// @vitest-environment node
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import sharp from 'sharp';
import { encodeVideo, outputSize, readBoundedBody, runMediaTool, validateProbe, validateMusicProbe } from './process-product-videos.mjs';
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
it('rejects music containers with video/artwork, invalid duration, excessive channels or false MIME', () => {
  const music = { format: { format_name: 'mp3', duration: '3' },
    streams: [{ codec_type: 'audio', codec_name: 'mp3', channels: 2, sample_rate: '44100' }] };
  expect(validateMusicProbe(music, 'audio/mpeg')).toBe(3);
  for (const invalid of [
    { ...music, streams: [...music.streams, { codec_type: 'video' }] },
    { ...music, streams: [{ ...music.streams[0], channels: 6 }] },
    { ...music, format: { ...music.format, duration: '601' } },
    { ...music, format: { ...music.format, duration: 'NaN' } },
    { ...music, streams: [{ ...music.streams[0], sample_rate: '192000' }] },
  ]) expect(() => validateMusicProbe(invalid, 'audio/mpeg')).toThrow('audio-only');
  expect(() => validateMusicProbe(music, 'audio/mp4')).toThrow('audio-only');
  expect(() => validateMusicProbe(probe, 'audio/mp4')).toThrow('audio-only');
  expect(() => validateMusicProbe({ ...music, format: { ...music.format, format_name: 'wav' } }, 'audio/wav')).toThrow('audio-only');
});

const streamsOf = async (file: string) => JSON.parse(await runMediaTool('ffprobe',
  ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])) as {
  streams: { codec_type: string; codec_name: string; width?: number; height?: number }[];
  format: { duration: string; size: string };
};
const audioStreams = async (file: string) =>
  (await streamsOf(file)).streams.filter(stream => stream.codec_type === 'audio');
const amplitudeOf = async (file: string) => {
  const pcm = `${file}.pcm`;
  await runMediaTool('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', file,
    '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', pcm]);
  const samples = await readFile(pcm);
  return (frequency: number, start: number, seconds = 0.15) => {
    let real = 0, imaginary = 0;
    const count = Math.floor(seconds * 48000);
    for (let i = 0; i < count; i++) {
      const value = samples.readFloatLE((Math.floor(start * 48000) + i) * 4);
      const phase = 2 * Math.PI * frequency * i / 48000;
      real += value * Math.cos(phase); imaginary += value * Math.sin(phase);
    }
    return 2 * Math.hypot(real, imaginary) / count;
  };
};

it.each([
  { sourceAudio: false, mode: 'replace', type: 'audio/wav', extension: 'wav', codec: 'pcm_s16le' },
  // Legacy queued/reprocessed rows may still carry 'mix'; they must drop source audio too.
  { sourceAudio: true, mode: 'mix', type: 'audio/mpeg', extension: 'mp3', codec: 'libmp3lame' },
  { sourceAudio: true, mode: 'replace', type: 'audio/mp4', extension: 'm4a', codec: 'aac' },
])('outputs only looped, trimmed, faded $extension music and never source audio ($mode row, source audio: $sourceAudio)', async ({ sourceAudio, mode, type, extension, codec }) => {
  const base = join(dir, `music-${extension}`);
  const input = `${base}-source.mp4`;
  const track = `${base}.${extension}`;
  const output = `${base}-music.mp4`;
  await runMediaTool('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=30',
    ...(sourceAudio ? ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000'] : []),
    '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', ...(sourceAudio ? ['-c:a', 'aac'] : []), input]);
  if (sourceAudio) expect(await audioStreams(input)).toHaveLength(1);
  await runMediaTool('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000',
    '-t', extension === 'wav' ? '3' : '0.3', '-c:a', codec, track]);
  const original = await readFile(input);
  const originalTrack = await readFile(track);
  const info = await encodeVideo(input, output, `${base}.webp`, runMediaTool, { path: track, type, mode });
  expect(Math.abs(info.duration - 2)).toBeLessThan(0.06);
  expect(await readFile(input)).toEqual(original);
  expect(await readFile(track)).toEqual(originalTrack);
  const audio = await audioStreams(output);
  expect(audio).toHaveLength(1);
  expect(audio[0].codec_name).toBe('aac');
  const amplitude = await amplitudeOf(output);
  // Short MP3/M4A tracks must loop; the longer WAV must trim to the clip length.
  expect(amplitude(880, 1.3)).toBeGreaterThan(0.006);
  expect(amplitude(880, 1)).toBeLessThan(0.04);
  expect(amplitude(880, 0, 0.05)).toBeLessThan(amplitude(880, 1) * 0.5);
  expect(amplitude(880, 1.94, 0.04)).toBeLessThan(amplitude(880, 1) * 0.5);
  // The loud 440 Hz source tone is entirely absent in every music mode.
  for (const at of [0.3, 1, 1.6]) expect(amplitude(440, at)).toBeLessThan(0.003);
  if (!sourceAudio) {
    await expect(encodeVideo(input, `${base}-invalid.mp4`, `${base}-invalid.webp`, runMediaTool,
      { path: input, type: 'audio/mp4', mode: 'replace' })).rejects.toThrow('audio-only');
  }
}, 120_000);

it('removes source audio entirely when no music is chosen (no audio stream at all)', async () => {
  const base = join(dir, 'no-music');
  const input = `${base}-source.mp4`;
  await runMediaTool('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-f', 'lavfi', '-i', 'anoisesrc=a=0.3:c=pink',
    '-filter_complex', '[1:a][2:a]amix=inputs=2[a]', '-map', '0:v', '-map', '[a]',
    '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', input]);
  expect(await audioStreams(input)).toHaveLength(1);
  const output = `${base}.mp4`;
  await encodeVideo(input, output, `${base}.webp`);
  expect(await audioStreams(output)).toHaveLength(0);
  expect((await streamsOf(output)).streams).toHaveLength(1);
}, 120_000);

it('rejects an encode whose output audio does not match the music choice', async () => {
  const withAudio = JSON.stringify(probe);
  await expect(encodeVideo('in.mp4', 'out.mp4', 'poster.webp', async () => withAudio))
    .rejects.toThrow('audio does not match');
});

it.each([
  { label: 'large landscape', width: 1920, height: 1080, expected: [1280, 720] },
  { label: 'phone portrait', width: 1080, height: 1920, expected: [404, 720] },
  { label: '4K portrait', width: 2160, height: 3840, expected: [404, 720] },
  { label: 'ultrawide', width: 3840, height: 1080, expected: [1280, 360] },
  { label: 'exact 720p', width: 1280, height: 720, expected: [1280, 720] },
  { label: 'small landscape', width: 160, height: 90, expected: [160, 90] },
  { label: 'small portrait', width: 360, height: 640, expected: [360, 640] },
  { label: 'odd small', width: 331, height: 187, expected: [330, 186] },
])('sizes $label without upscaling, cropping or changing orientation', ({ width, height, expected }) => {
  const result = outputSize(width, height);
  expect([result.width, result.height]).toEqual(expected);
  expect(result.width).toBeLessThanOrEqual(Math.max(width, 2));
  expect(result.height).toBeLessThanOrEqual(Math.max(height, 2));
  expect(Math.abs(result.width / result.height - width / height) / (width / height)).toBeLessThan(0.02);
  expect(result.width % 2 + result.height % 2).toBe(0);
});

it('encodes a real phone-portrait source to a compact 404x720 portrait MP4', async () => {
  const base = join(dir, 'phone-portrait');
  const input = `${base}-source.mp4`;
  const output = `${base}.mp4`;
  await runMediaTool('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-c:a', 'aac', input]);
  const info = await encodeVideo(input, output, `${base}.webp`);
  expect([info.width, info.height]).toEqual([404, 720]);
  const encoded = await streamsOf(output);
  expect(encoded.streams.filter(stream => stream.codec_type === 'audio')).toHaveLength(0);
  const bytes = Number(encoded.format.size);
  const sourceBytes = (await readFile(input)).byteLength;
  // CRF 24 + 30fps cap: well under 3 Mbit/s and smaller than the high-quality source.
  expect(bytes * 8 / Number(encoded.format.duration)).toBeLessThan(3_000_000);
  expect(bytes).toBeLessThan(sourceBytes);
}, 120_000);

it('processes a real synthetic MP4 with FFmpeg into faststart H264 without source audio and a WebP poster', async () => {
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
  expect(await audioStreams(output)).toHaveLength(0);
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
    return JSON.stringify(calls.length === 4 ? { ...probe, streams: [probe.streams[0]] } : probe);
  });
  expect(calls[0]).toContain('file,pipe');
  expect(calls[1]).toContain('untrusted;$(run).mp4');
  expect(calls[1]).toContain('-map_metadata');
  expect(calls[1]).toContain('+faststart');
  expect(calls[1]).toContain('-filter_complex');
  expect(calls[1].some(value => value.includes('overlay=main_w-overlay_w'))).toBe(true);
  expect(calls[1]).toContain('-an');
  expect(calls[1].join(' ')).not.toMatch(/0:a|\[0:a/);
  const musicCalls: string[][] = [];
  const music = { format: { format_name: 'mp3', duration: '3' },
    streams: [{ codec_type: 'audio', codec_name: 'mp3', channels: 2, sample_rate: '44100' }] };
  await encodeVideo('in.mp4', 'out.mp4', 'poster.webp', async (_tool: string, args: string[]) => {
    musicCalls.push(args);
    return JSON.stringify(musicCalls.length === 2 ? music : probe);
  }, { path: 'music.bin', type: 'audio/mpeg', mode: 'mix' });
  const ffmpeg = musicCalls[2].join(' ');
  expect(ffmpeg).not.toMatch(/0:a|amix/);
  expect(ffmpeg).toContain('-map [audio]');
  expect(musicCalls[2]).not.toContain('-an');
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
  // Small sources are never upscaled.
  const displayWidth = rotate ? height : width * sar;
  const displayHeight = rotate ? width : height;
  expect(info.width).toBeLessThanOrEqual(displayWidth);
  expect(info.height).toBeLessThanOrEqual(displayHeight);
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
