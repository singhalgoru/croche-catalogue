import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteImagesFromR2,
  isR2ImagePath,
  resetR2AvailabilityForTests,
  uploadImageToR2,
} from './r2ImageStorage';

const mockInvoke = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

vi.mock('../utils/imageUploadConversion', () => ({
  createResizedWebp: (_file: File, width: number) =>
    Promise.resolve(new File([`w${width}`], `w${width}.webp`, { type: 'image/webp' })),
}));

const webpFile = () => new File(['full'], 'product.webp', { type: 'image/webp' });
const httpError = (status: number, body: unknown = { error: `Status ${status}` }) => ({
  message: 'Edge Function returned a non-2xx status code',
  context: new Response(JSON.stringify(body), { status }),
});

describe('r2ImageStorage', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    resetR2AvailabilityForTests();
  });

  it('uploads the full image and every display width', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        imagePath: 'r2:products/user-1/abc',
        imageUrl: 'https://images.luviacreations.com/products/user-1/abc.webp',
      },
      error: null,
    });

    const stored = await uploadImageToR2(webpFile());

    expect(stored).toEqual({
      imagePath: 'r2:products/user-1/abc',
      imageUrl: 'https://images.luviacreations.com/products/user-1/abc.webp',
    });
    const [name, options] = mockInvoke.mock.calls[0];
    expect(name).toBe('r2-images');
    const form = options.body as FormData;
    expect([...form.keys()]).toEqual(['full', 'w160', 'w480', 'w960']);
  });

  it.each([404, 501])('falls back and stops retrying when the function returns %i', async (status) => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError(status) });

    await expect(uploadImageToR2(webpFile())).resolves.toBeNull();
    await expect(uploadImageToR2(webpFile())).resolves.toBeNull();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('falls back when the function cannot be reached', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });

    await expect(uploadImageToR2(webpFile())).resolves.toBeNull();
  });

  it('surfaces real upload failures instead of silently falling back', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError(502, { error: 'R2 upload failed' }) });

    await expect(uploadImageToR2(webpFile())).rejects.toThrow('R2 upload failed');
  });

  it('rejects malformed upload responses', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { imagePath: 'user-1/abc.webp', imageUrl: 'https://example.com/a.webp' },
      error: null,
    });

    await expect(uploadImageToR2(webpFile())).rejects.toThrow('invalid upload response');
  });

  it('deletes only R2 paths', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { deleted: 1 }, error: null });

    await deleteImagesFromR2(['user-1/old.webp', 'r2:products/user-1/abc']);

    expect(mockInvoke).toHaveBeenCalledWith('r2-images', {
      body: { action: 'delete', paths: ['r2:products/user-1/abc'] },
    });
  });

  it('skips the function call when there is nothing in R2 to delete', async () => {
    await deleteImagesFromR2(['user-1/old.webp']);

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(isR2ImagePath('r2:products/user-1/abc')).toBe(true);
    expect(isR2ImagePath('user-1/abc.webp')).toBe(false);
  });
});
