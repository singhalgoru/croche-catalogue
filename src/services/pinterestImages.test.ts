import { beforeEach, expect, it, vi } from 'vitest';
import { getPinterestImage, removePinterestImage, savePinterestImage } from './pinterestImages';
import { validatePinterestImage, convertImageForUpload } from '../utils/imageUploadConversion';
import { archiveImageOriginal } from './imageOriginals';
import { uploadImageToR2 } from './r2ImageStorage';

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
  };
  return { query, from: vi.fn(() => query) };
});
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: vi.fn(async () => ({ from: mocks.from })) }));
vi.mock('../utils/imageUploadConversion', () => ({ validatePinterestImage: vi.fn(), convertImageForUpload: vi.fn() }));
vi.mock('./imageOriginals', () => ({ archiveImageOriginal: vi.fn() }));
vi.mock('./r2ImageStorage', () => ({ uploadImageToR2: vi.fn() }));

const previous = { image_path: 'r2:products/u/old', image_url: 'https://images.luviacreations.com/products/u/old.webp', revision: 'old-revision' };
const uploaded = { imagePath: 'r2:products/u/new', imageUrl: 'https://images.luviacreations.com/products/u/new.webp' };
const file = new File(['portrait'], 'portrait.jpg', { type: 'image/jpeg' });
const clean = new File(['webp'], 'portrait.webp', { type: 'image/webp' });

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of ['select', 'eq', 'insert', 'update', 'delete'] as const) mocks.query[method].mockReturnValue(mocks.query);
  vi.mocked(validatePinterestImage).mockResolvedValue();
  vi.mocked(convertImageForUpload).mockResolvedValue(clean);
  vi.mocked(archiveImageOriginal).mockResolvedValue('new-id');
  vi.mocked(uploadImageToR2).mockResolvedValue(uploaded);
});

it('archives and stores a clean WebP and saves the variant mapping', async () => {
  mocks.query.select.mockResolvedValueOnce({ data: [{ variant_id: 'v1' }], error: null });
  const result = await savePinterestImage('v1', file, null);
  expect(validatePinterestImage).toHaveBeenCalledWith(file);
  expect(convertImageForUpload).toHaveBeenCalledWith(file, { watermark: false });
  expect(archiveImageOriginal).toHaveBeenCalledWith(file);
  expect(uploadImageToR2).toHaveBeenCalledWith(clean, 'new-id');
  expect(mocks.query.insert).toHaveBeenCalledWith(expect.objectContaining({ variant_id: 'v1', image_path: uploaded.imagePath }));
  expect(result.image_url).toBe(uploaded.imageUrl);
});

it('detects a stale replacement and does not delete a potentially committed upload', async () => {
  mocks.query.select.mockResolvedValueOnce({ data: [], error: null });
  await expect(savePinterestImage('v1', file, previous)).rejects.toThrow('changed');
  expect(mocks.query.eq).toHaveBeenCalledWith('revision', 'old-revision');
});

it('surfaces load errors and guards removal against stale revisions', async () => {
  mocks.query.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
  await expect(getPinterestImage('v1')).rejects.toThrow('denied');
  mocks.query.select.mockReturnValueOnce(mocks.query).mockResolvedValueOnce({ data: [], error: null });
  await expect(removePinterestImage('v1', previous)).rejects.toThrow('changed');
  expect(mocks.query.eq).toHaveBeenCalledWith('revision', 'old-revision');
});
