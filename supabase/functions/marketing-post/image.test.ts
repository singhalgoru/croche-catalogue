// @vitest-environment node
import { expect, it, vi } from 'vitest';
vi.mock('https://esm.sh/aws4fetch@1.0.20', () => ({ AwsClient: vi.fn() }));
import { validatePostJpeg } from './image';

const jpeg = (width = 1080, height = 1080, afterFrame: number[] = []) => new Uint8Array([
  0xff, 0xd8,
  0xff, 0xc0, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0,
  ...afterFrame,
  0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 1, 0xff, 0xd9,
]);

it('accepts a square JPEG header but rejects incorrect sizes, non-JPEG and extended JPEG even after the frame', () => {
  expect(() => validatePostJpeg(jpeg())).not.toThrow();
  expect(() => validatePostJpeg(jpeg(1079))).toThrow('1080 by 1080');
  expect(() => validatePostJpeg(new TextEncoder().encode('not a jpeg'))).toThrow('valid JPEG');
  expect(() => validatePostJpeg(jpeg(1080, 1080, [0xff, 0xe2, 0, 6, 0x4d, 0x50, 0x46, 0]))).toThrow('Extended JPEG');
});
