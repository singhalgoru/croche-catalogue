import { afterEach, describe, expect, it, vi } from 'vitest';
import { convertImageForUpload, createResizedWebp } from './imageUploadConversion';

const mockImageEncoding = (width: number, height: number, encodedSize: number) => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:product'),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal('Image', class {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  });
  const drawImage = vi.fn();
  const context = {
    drawImage,
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    clip: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob([new Uint8Array(encodedSize)], { type: 'image/webp' }));
  });
  return { drawImage, toBlob, context };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('image upload compression', () => {
  it('creates a processed clean WebP with the same size and quality limits but no badge', async () => {
    const { drawImage, toBlob, context } = mockImageEncoding(3200, 1600, 50_000);
    const original = new File([new Uint8Array(1_000_000)], 'photo.png', { type: 'image/png' });
    const converted = await convertImageForUpload(original, { watermark: false });

    expect(converted.name).toBe('photo.webp');
    expect(converted.type).toBe('image/webp');
    expect(converted.size).toBe(50_000);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 800);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.82);
    expect(context.save).not.toHaveBeenCalled();
    expect(context.arc).not.toHaveBeenCalled();
  });
  it('resizes even existing WebP files to 1600px and recompresses at 82% quality', async () => {
    const { drawImage, toBlob } = mockImageEncoding(3200, 1600, 50_000);
    const original = new File([new Uint8Array(1_000_000)], 'photo.webp', { type: 'image/webp' });
    const converted = await convertImageForUpload(original);

    expect(converted.type).toBe('image/webp');
    expect(converted.size).toBe(50_000);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 800);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.82);
  });

  it('always re-encodes so even small WebP files get the watermark', async () => {
    mockImageEncoding(800, 800, 50_000);
    const original = new File([new Uint8Array(1000)], 'photo.webp', { type: 'image/webp' });
    const converted = await convertImageForUpload(original);
    expect(converted).not.toBe(original);
    expect(converted.type).toBe('image/webp');
  });

  it('stamps the Luvia badge in the bottom-right corner at 70% opacity', async () => {
    const { drawImage, context } = mockImageEncoding(3200, 1600, 50_000);
    const original = new File([new Uint8Array(1_000_000)], 'photo.jpg', { type: 'image/jpeg' });
    await convertImageForUpload(original);

    // 1600x800 canvas: badge is 12% of 800 (96px) with a 3% (24px) margin,
    // in the photo's real bottom-right corner.
    expect(drawImage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 1480, 680);
    expect(context.globalAlpha).toBe(0.7);
  });

  it('rejects formats not supported by the image picker', async () => {
    const original = new File(['not an image'], 'photo.svg', { type: 'image/svg+xml' });
    await expect(convertImageForUpload(original)).rejects.toThrow('Upload a JPG, PNG or WebP');
  });

  it('creates fixed-width WebP copies without upscaling small images', async () => {
    const { drawImage, toBlob } = mockImageEncoding(1600, 1200, 9_000);
    const source = new File([new Uint8Array(10)], 'photo.webp', { type: 'image/webp' });

    const resized = await createResizedWebp(source, 480);
    expect(resized.name).toBe('w480.webp');
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 480, 360);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.75);

    await createResizedWebp(source, 2000);
    expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, 1600, 1200);
  });
});
