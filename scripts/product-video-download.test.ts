// @vitest-environment node
import { access, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { downloadToFile, MAX_SOURCE_BYTES } from './process-product-videos.mjs';

const dir = resolve('.video-processing', 'test-stream-download');
beforeAll(async () => { await mkdir(dir, { recursive: true }); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

function stream(chunks: number[], error = false, cancelled = vi.fn()) {
  return { body: new ReadableStream<Uint8Array>({
    pull(controller) {
      const size = chunks.shift();
      if (size !== undefined) controller.enqueue(new Uint8Array(size).fill(7));
      else if (error) controller.error(new Error('Network interrupted'));
      else controller.close();
    },
    cancel: cancelled,
  }), cancelled };
}

it('streams a real exact 500 MB input to disk without buffering the original', async () => {
  expect(MAX_SOURCE_BYTES).toBe(500 * 1024 * 1024);
  const chunk = new Uint8Array(256 * 1024).fill(3);
  let remaining = MAX_SOURCE_BYTES;
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!remaining) { controller.close(); return; }
      controller.enqueue(chunk);
      remaining -= chunk.byteLength;
    },
  }));
  const arrayBuffer = vi.spyOn(response, 'arrayBuffer').mockRejectedValue(new Error('Do not buffer original'));
  const path = join(dir, 'boundary.mp4');
  try {
    expect(await downloadToFile(response, path, MAX_SOURCE_BYTES, MAX_SOURCE_BYTES)).toBe(MAX_SOURCE_BYTES);
    expect((await stat(path)).size).toBe(MAX_SOURCE_BYTES);
    expect(arrayBuffer).not.toHaveBeenCalled();
  } finally { await rm(path, { force: true }); }
}, 30_000);

it('preserves exact streamed bytes with no Content-Length and validates the stored byte count', async () => {
  const { body } = stream([2, 3]);
  const path = join(dir, 'valid.mp4');
  expect(await downloadToFile(new Response(body), path, 5, 5)).toBe(5);
  expect(await readFile(path)).toEqual(Buffer.alloc(5, 7));
});

it.each([
  { chunks: [3, 3], expected: 5, length: '1', message: 'size limit' },
  { chunks: [3, 2, 1], expected: 5, message: 'size limit' },
  { chunks: [2, 2], expected: 5, message: 'size changed' },
  { chunks: [3, 2], expected: 4, message: 'size changed' },
  { chunks: [3, 2], expected: 5, length: '4', message: 'size changed' },
])('cancels and removes partial files on stream boundary mismatch: $message', async ({ chunks, expected, length, message }) => {
  const { body } = stream([...chunks]);
  const path = join(dir, 'invalid.mp4');
  const response = new Response(body, { headers: length ? { 'content-length': length } : {} });
  await expect(downloadToFile(response, path, 5, expected)).rejects.toThrow(message);
  await expect(access(path)).rejects.toThrow();
});

it('closes the file and removes partial bytes after a real reader failure', async () => {
  const { body } = stream([2], true);
  const path = join(dir, 'interrupted.mp4');
  await expect(downloadToFile(new Response(body), path, 5, 5)).rejects.toThrow('Network interrupted');
  await expect(access(path)).rejects.toThrow();
});

it('cancels invalid declared sizes and invalid stored reservations before creating any file', async () => {
  for (const [length, expected] of [['6', 5], ['invalid', 5], ['5', 6], ['5', 0]] as const) {
    const { body, cancelled } = stream([5]);
    const path = join(dir, 'unopened.mp4');
    await expect(downloadToFile(new Response(body, { headers: { 'content-length': length } }), path, 5, expected))
      .rejects.toThrow();
    expect(cancelled).toHaveBeenCalled();
    await expect(access(path)).rejects.toThrow();
  }
});
