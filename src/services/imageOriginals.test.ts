import { beforeEach, describe, expect, it, vi } from 'vitest';
import { archiveImageOriginal } from './imageOriginals';

const { upload, from } = vi.hoisted(() => {
  const upload = vi.fn();
  return { upload, from: vi.fn(() => ({ upload })) };
});
vi.mock('../lib/supabaseConfig', () => ({
  loadSupabase: async () => ({ storage: { from } }),
}));

describe('archiveImageOriginal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upload.mockResolvedValue({ error: null });
  });

  it.each([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']])(
    'archives the exact %s file privately before publication',
    async (type, extension) => {
      const file = new File(['unwatermarked original bytes'], 'photo', { type });
      const id = await archiveImageOriginal(file, 'admin');
      expect(from).toHaveBeenCalledWith('product-originals');
      expect(upload).toHaveBeenCalledWith(`admin/${id}/original.${extension}`, file, {
        contentType: type, upsert: false,
      });
    },
  );

  it('rejects an archive failure rather than allowing publication', async () => {
    upload.mockResolvedValue({ error: { message: 'Storage unavailable' } });
    await expect(archiveImageOriginal(new File(['x'], 'photo.png', { type: 'image/png' }), 'admin'))
      .rejects.toThrow('The image was not published: Storage unavailable');
  });

  it('rejects invalid and oversized originals before uploading', async () => {
    for (const file of [
      new File(['x'], 'x.gif', { type: 'image/gif' }),
      new File([], 'x.png', { type: 'image/png' }),
      new File([new Uint8Array(6 * 1024 * 1024 + 1)], 'x.png', { type: 'image/png' }),
    ]) {
      await expect(archiveImageOriginal(file, 'admin')).rejects.toThrow('no larger than 6 MB');
    }
    expect(upload).not.toHaveBeenCalled();
  });
});
