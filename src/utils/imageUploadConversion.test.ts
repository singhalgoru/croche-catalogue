import { afterEach, describe, expect, it, vi } from 'vitest';
import { convertImageForUpload, createResizedWebp } from './imageUploadConversion';

const { encodeWebp } = vi.hoisted(() => ({ encodeWebp: vi.fn() }));
vi.mock('./webpEncoder', () => ({ encodeWebp }));

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
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
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
  encodeWebp.mockReset();
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
    expect(encodeWebp).not.toHaveBeenCalled();
  });
  it.each(['png', 'null'])('encodes locally when native WebP encoding returns %s', async fallback => {
    const { toBlob, context } = mockImageEncoding(3200, 1600, 50_000);
    toBlob.mockImplementation(callback => callback(fallback === 'null' ? null : new Blob(['png'], { type: 'image/png' })));
    encodeWebp.mockResolvedValue(new Blob(['encoded'], { type: 'image/webp' }));
    const original = new File(['image'], 'photo.jpg', { type: 'image/jpeg', lastModified: 123 });
    const converted = await convertImageForUpload(original, { watermark: false });

    expect(converted.name).toBe('photo.webp');
    expect(converted.type).toBe('image/webp');
    expect(converted.size).toBe(7);
    expect(converted.lastModified).toBe(123);
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 1600, 800);
    expect(encodeWebp).toHaveBeenCalledWith(context.getImageData.mock.results[0].value, 0.82);
    expect(context.save).not.toHaveBeenCalled();
  });

  it('encodes the watermarked canvas and resized variants with the same fallback', async () => {
    const { toBlob, context } = mockImageEncoding(800, 600, 50_000);
    toBlob.mockImplementation(callback => callback(new Blob(['png'], { type: 'image/png' })));
    encodeWebp.mockResolvedValue(new Blob(['encoded'], { type: 'image/webp' }));
    const original = new File(['image'], 'photo.jpg', { type: 'image/jpeg' });
    await convertImageForUpload(original);
    expect(context.save).toHaveBeenCalled();
    expect(context.drawImage.mock.invocationCallOrder.at(-1)).toBeLessThan(context.getImageData.mock.invocationCallOrder[0]);
    const resized = await createResizedWebp(original, 480);
    expect(resized.name).toBe('w480.webp');
    expect(resized.type).toBe('image/webp');
    expect(context.getImageData).toHaveBeenLastCalledWith(0, 0, 480, 360);
    expect(encodeWebp).toHaveBeenLastCalledWith(context.getImageData.mock.results[1].value, 0.75);
  });

  it('surfaces local encoder failures instead of returning a mislabeled PNG', async () => {
    const { toBlob } = mockImageEncoding(800, 600, 50_000);
    toBlob.mockImplementation(callback => callback(new Blob(['png'], { type: 'image/png' })));
    encodeWebp.mockRejectedValue(new Error('Unable to prepare the image on this device.'));
    await expect(convertImageForUpload(new File(['image'], 'photo.jpg', { type: 'image/jpeg' }), { watermark: false }))
      .rejects.toThrow('Unable to prepare the image on this device.');
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
