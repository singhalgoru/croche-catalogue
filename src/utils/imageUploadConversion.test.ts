import { afterEach, describe, expect, it, vi } from 'vitest';
import { convertImageForUpload } from './imageUploadConversion';

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
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob([new Uint8Array(encodedSize)], { type: 'image/webp' }));
  });
  return { drawImage, toBlob };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('image upload compression', () => {
  it('resizes even existing WebP files to 1600px and recompresses at 82% quality', async () => {
    const { drawImage, toBlob } = mockImageEncoding(3200, 1600, 50_000);
    const original = new File([new Uint8Array(1_000_000)], 'photo.webp', { type: 'image/webp' });
    const converted = await convertImageForUpload(original);

    expect(converted.type).toBe('image/webp');
    expect(converted.size).toBe(50_000);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 800);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.82);
  });

  it('keeps the original if encoding would increase its size', async () => {
    mockImageEncoding(800, 800, 50_000);
    const original = new File([new Uint8Array(1000)], 'photo.webp', { type: 'image/webp' });
    expect(await convertImageForUpload(original)).toBe(original);
  });

  it('rejects formats not supported by the image picker', async () => {
    const original = new File(['not an image'], 'photo.svg', { type: 'image/svg+xml' });
    await expect(convertImageForUpload(original)).rejects.toThrow('Upload a JPG, PNG or WebP');
  });
});
