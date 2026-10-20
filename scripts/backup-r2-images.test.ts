// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { storageFetch } = vi.hoisted(() => ({ storageFetch: vi.fn() }));
vi.mock('aws4fetch', () => ({ AwsClient: class { fetch = storageFetch; } }));

let destination: string;
let manifest: string;
const originalArgv = process.argv;
const originalExitCode = process.exitCode;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  for (const [key, value] of Object.entries({
    R2_ACCOUNT_ID: 'fixture', R2_ACCESS_KEY_ID: 'fixture', R2_SECRET_ACCESS_KEY: 'fixture',
    R2_BUCKET: 'luvia-videos', R2_BACKUP_BUCKET: '',
  })) vi.stubEnv(key, value);
  destination = await mkdtemp(path.join(os.tmpdir(), 'luvia-video-backup-test-'));
  manifest = path.join(destination, 'manifest.json');
  process.argv = ['node', 'backup-r2-images.mjs', destination, manifest];
  process.exitCode = undefined;
});

afterEach(async () => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(destination, { recursive: true, force: true });
});

it('backs up processed videos and posters across pages, retains removed files, and skips unchanged bytes', async () => {
  await mkdir(path.join(destination, 'making-videos', 'old'), { recursive: true });
  await writeFile(path.join(destination, 'making-videos', 'old', 'video.mp4'), 'retained');
  storageFetch.mockImplementation(async (input: string) => {
    const url = new URL(input);
    expect(url.pathname.startsWith('/luvia-videos')).toBe(true);
    if (url.searchParams.has('list-type')) {
      return new Response(url.searchParams.has('continuation-token')
        ? '<ListBucketResult><Contents><Key>making-videos/job/poster.webp</Key><Size>6</Size></Contents><IsTruncated>false</IsTruncated></ListBucketResult>'
        : '<ListBucketResult><Contents><Key>making-videos/job/video.mp4</Key><Size>5</Size></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>page&amp;2</NextContinuationToken></ListBucketResult>');
    }
    return new Response(url.pathname.endsWith('.mp4') ? 'video' : 'poster');
  });
  await import('./backup-r2-images.mjs');
  expect(await readFile(path.join(destination, 'making-videos', 'job', 'video.mp4'), 'utf8')).toBe('video');
  expect(await readFile(path.join(destination, 'making-videos', 'job', 'poster.webp'), 'utf8')).toBe('poster');
  expect(await readFile(path.join(destination, 'making-videos', 'old', 'video.mp4'), 'utf8')).toBe('retained');
  expect(JSON.parse(await readFile(manifest, 'utf8'))).toEqual([
    { key: 'making-videos/job/video.mp4', size: 5 },
    { key: 'making-videos/job/poster.webp', size: 6 },
  ]);
  expect(storageFetch.mock.calls[1][0]).toContain('continuation-token=page%262');
  storageFetch.mockClear();
  vi.resetModules();
  await import('./backup-r2-images.mjs');
  expect(storageFetch).toHaveBeenCalledTimes(2);
  expect(process.exitCode).toBeUndefined();
});

it.each([403, 200])('reports denied or truncated object downloads without replacing a valid manifest (%s)', async status => {
  await writeFile(manifest, 'previous manifest');
  storageFetch.mockImplementation(async (input: string) => new URL(input).searchParams.has('list-type')
    ? new Response('<ListBucketResult><Contents><Key>making-videos/job/video.mp4</Key><Size>5</Size></Contents></ListBucketResult>')
    : new Response('bad', { status }));
  await import('./backup-r2-images.mjs');
  expect(process.exitCode).toBe(1);
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Failed making-videos/job/video.mp4'));
  expect(await readFile(manifest, 'utf8')).toBe('previous manifest');
});

it('fails explicitly when the video bucket cannot be listed', async () => {
  storageFetch.mockResolvedValue(new Response('AccessDenied', { status: 403 }));
  await expect(import('./backup-r2-images.mjs')).rejects.toThrow('Listing failed with status 403');
});

it('wires daily video backup, independent failure reporting, and monthly size verification', async () => {
  const workflow = await readFile(new URL('../.github/workflows/backup-database.yml', import.meta.url), 'utf8');
  expect(workflow).toContain('R2_BUCKET: ${{ secrets.R2_VIDEO_BUCKET }}');
  expect(workflow).toContain('node scripts/backup-r2-images.mjs backup-repo/r2-videos backup-repo/r2-videos/manifest.json');
  expect(workflow).toMatch(/id: videos\s+continue-on-error: true/);
  expect(workflow).toContain("steps.videos.outcome == 'failure'");
  expect(workflow.indexOf('id: videos')).toBeLessThan(workflow.indexOf('name: Push rotated backup'));
  const restore = await readFile(new URL('../.github/workflows/verify-backup-restore.yml', import.meta.url), 'utf8');
  expect(restore).toContain('for directory in ("image-originals", "r2-videos")');
  expect(restore).toContain('file.stat().st_size != item["size"]');
});
