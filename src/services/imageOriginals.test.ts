import { beforeEach, describe, expect, it, vi } from 'vitest';
import { archiveImageOriginal } from './imageOriginals';

const { invoke, convert } = vi.hoisted(() => ({ invoke: vi.fn(), convert: vi.fn() }));
vi.mock('../utils/imageUploadConversion', () => ({ convertImageForUpload: convert }));
vi.mock('../lib/supabaseConfig', () => ({
  loadSupabase: async () => ({ functions: { invoke } }),
}));

describe('archiveImageOriginal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    convert.mockResolvedValue(new File(['processed'], 'photo.webp', { type: 'image/webp' }));
    invoke.mockImplementation(async (_name: string, { body }: { body: FormData }) =>
      ({ data: { imageId: body.get('imageId') }, error: null }));
  });

  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    'archives a processed clean WebP for %s input before publication',
    async (type) => {
      const file = new File(['unwatermarked original bytes'], 'photo', { type });
      const id = await archiveImageOriginal(file);
      const [name, { body }] = invoke.mock.calls[0];
      expect(name).toBe('r2-images');
      expect(body.get('imageId')).toBe(id);
      expect(body.get('action')).toBe('archive-original');
      expect(convert).toHaveBeenCalledWith(file, { watermark: false });
      expect(body.get('original').name).toBe('original.webp');
      expect(body.get('original').type).toBe('image/webp');
      expect(body.get('original').size).toBe(9);
    },
  );

  it('rejects an archive failure rather than allowing publication', async () => {
    invoke.mockResolvedValue({ error: { message: 'Storage unavailable' } });
    await expect(archiveImageOriginal(new File(['x'], 'photo.png', { type: 'image/png' })))
      .rejects.toThrow('The image was not published: Storage unavailable');
  });

  it('rejects invalid and oversized originals before uploading', async () => {
    for (const file of [
      new File(['x'], 'x.gif', { type: 'image/gif' }),
      new File([], 'x.png', { type: 'image/png' }),
      new File([new Uint8Array(6 * 1024 * 1024 + 1)], 'x.png', { type: 'image/png' }),
    ]) {
      await expect(archiveImageOriginal(file)).rejects.toThrow('no larger than 6 MB');
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects an invalid archival acknowledgement', async () => {
    invoke.mockResolvedValue({ data: { imageId: 'wrong-id' }, error: null });
    await expect(archiveImageOriginal(new File(['x'], 'photo.png', { type: 'image/png' })))
      .rejects.toThrow('invalid response');
  });

  it('does not archive when clean image processing fails', async () => {
    convert.mockRejectedValueOnce(new Error('Encoding failed'));
    await expect(archiveImageOriginal(new File(['x'], 'photo.png', { type: 'image/png' })))
      .rejects.toThrow('Encoding failed');
    expect(invoke).not.toHaveBeenCalled();
  });
});
