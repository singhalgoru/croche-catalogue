import { beforeEach, expect, it, vi } from 'vitest';

const { encode, init } = vi.hoisted(() => ({ encode: vi.fn(), init: vi.fn() }));
vi.mock('@jsquash/webp/encode.js', () => ({ default: encode, init }));
const image: ImageData = { data: new Uint8ClampedArray(16), width: 2, height: 2, colorSpace: 'srgb' };

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  init.mockResolvedValue({});
  encode.mockResolvedValue(new ArrayBuffer(16));
});

it('initializes once with self-hosted scalar/SIMD assets and preserves quality', async () => {
  const { encodeWebp } = await import('./webpEncoder');
  const blob = await encodeWebp(image, 0.82);
  expect(blob.type).toBe('image/webp');
  expect(blob.size).toBe(16);
  expect(encode).toHaveBeenCalledWith(image, { quality: 82 });
  const { locateFile } = init.mock.calls[0][0];
  expect(locateFile('webp_enc.wasm')).toContain('webp_enc.wasm');
  expect(locateFile('webp_enc_simd.wasm')).toContain('webp_enc_simd.wasm');
  await encodeWebp(image, 0.75);
  expect(init).toHaveBeenCalledTimes(1);
  expect(encode).toHaveBeenLastCalledWith(image, { quality: 75 });
});

it('surfaces initialization failures and allows a later retry', async () => {
  const { encodeWebp } = await import('./webpEncoder');
  const failure = new Error('WASM fetch failed');
  init.mockRejectedValueOnce(failure);
  await expect(encodeWebp(image, 0.82)).rejects.toMatchObject({
    message: expect.stringContaining('Unable to prepare the image on this device'),
    cause: failure,
  });
  expect(encode).not.toHaveBeenCalled();
  await expect(encodeWebp(image, 0.82)).resolves.toBeInstanceOf(Blob);
  expect(init).toHaveBeenCalledTimes(2);
});
