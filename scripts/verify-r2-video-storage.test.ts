// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { storageFetch } = vi.hoisted(() => ({ storageFetch: vi.fn() }));
vi.mock('aws4fetch', () => ({ AwsClient: class { fetch = storageFetch; } }));
let objects: Map<string, Uint8Array>;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  for (const [name, value] of Object.entries({ R2_ACCOUNT_ID: 'fixture', R2_ACCESS_KEY_ID: 'fixture',
    R2_SECRET_ACCESS_KEY: 'fixture', R2_BUCKET: 'public', R2_ORIGINALS_BUCKET: 'private', R2_OBJECT_CHECK_ONLY: 'true' })) {
    vi.stubEnv(name, value);
  }
  objects = new Map();
  storageFetch.mockImplementation(async (url: string, options: {
    method?: string; body?: Uint8Array; headers?: Record<string, string>;
  }) => {
    const path = new URL(url).pathname;
    if (options.method === 'DELETE') { objects.delete(path); return new Response(null, { status: 204 }); }
    if (options.method === 'HEAD') return new Response(null, { status: objects.has(path) ? 200 : 404 });
    if (options.method === 'PUT') {
      const source = options.headers?.['x-amz-copy-source'];
      const bytes = source ? objects.get(source) : options.body;
      if (!bytes) return new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 });
      objects.set(path, bytes);
      return new Response(source ? '<CopyObjectResult/>' : '');
    }
    const bytes = objects.get(path);
    return bytes ? new Response(bytes) : new Response(null, { status: 404 });
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it('object-only mode skips all CORS configuration and byte-verifies both copy directions with exact cleanup', async () => {
  await import('./verify-r2-video-storage.mjs');
  expect(storageFetch.mock.calls.some(call => call[0].includes('?cors'))).toBe(false);
  const copies = storageFetch.mock.calls.filter(call => call[1]?.headers?.['x-amz-copy-source']);
  expect(copies).toHaveLength(2);
  expect(copies[0][0]).toContain('/public/making-video-smoke/');
  expect(copies[1][0]).toContain('/private/making-video-smoke/');
  const deletes = storageFetch.mock.calls.filter(call => call[1]?.method === 'DELETE');
  expect(deletes).toHaveLength(3);
  expect(deletes.every(call => /\/making-video-smoke\/[0-9a-f-]{36}\/(source|copy-public|copy-private)\.txt$/.test(call[0]))).toBe(true);
  expect(objects.size).toBe(0);
});
it('fails explicitly without a private bucket instead of silently passing a partial storage check', async () => {
  vi.stubEnv('R2_ORIGINALS_BUCKET', '');
  await expect(import('./verify-r2-video-storage.mjs')).rejects.toThrow('requires R2_ORIGINALS_BUCKET');
  expect(storageFetch).not.toHaveBeenCalled();
});
it('cleans every attempted exact key after copy denial and does not report success', async () => {
  const original = storageFetch.getMockImplementation()!;
  storageFetch.mockImplementation(async (...args) => {
    if (args[1]?.headers?.['x-amz-copy-source']) return new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 });
    return original(...args);
  });
  await expect(import('./verify-r2-video-storage.mjs')).rejects.toThrow('CopyObject: HTTP 403 AccessDenied');
  expect(objects.size).toBe(0);
  expect(storageFetch.mock.calls.filter(call => call[1]?.method === 'DELETE')).toHaveLength(2);
});
it('surfaces cleanup failure with exact recovery keys and still attempts other deletions', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const original = storageFetch.getMockImplementation()!;
  storageFetch.mockImplementation(async (...args) => {
    if (args[1]?.method === 'DELETE' && args[0].endsWith('/copy-private.txt')) {
      return new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 });
    }
    return original(...args);
  });
  await expect(import('./verify-r2-video-storage.mjs')).rejects.toThrow('could not be confirmed deleted');
  expect(errors).toHaveBeenCalledWith(expect.stringMatching(/private exact key making-video-smoke\/[0-9a-f-]+\/copy-private\.txt:.*403 AccessDenied/));
  expect(storageFetch.mock.calls.filter(call => call[1]?.method === 'DELETE')).toHaveLength(3);
});
