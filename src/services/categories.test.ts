import { beforeEach, expect, it, vi } from 'vitest';
import { generateCategoryOverview, removeSeasonalCategoryImages, saveCategoryOverview, saveSeasonalCategory, uploadSeasonalCategoryImage } from './categories';
import { archiveImageOriginal } from './imageOriginals';
import { deleteImagesFromR2, uploadImageToR2 } from './r2ImageStorage';
import { convertImageForUpload } from '../utils/imageUploadConversion';
const { invoke, rpc } = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({ functions: { invoke }, rpc }) }));
vi.mock('./imageOriginals', () => ({ archiveImageOriginal: vi.fn() }));
vi.mock('./r2ImageStorage', () => ({ uploadImageToR2: vi.fn(), deleteImagesFromR2: vi.fn() }));
vi.mock('../utils/imageUploadConversion', () => ({ convertImageForUpload: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it('rejects saving overviews longer than 90 words on either category path', async () => {
  const overview = Array(91).fill('crochet').join(' ');
  await expect(saveCategoryOverview('Toys', overview)).rejects.toThrow('90 words');
  await expect(saveSeasonalCategory('Navratri', [], true, overview)).rejects.toThrow('90 words');
});
it('returns a validated overview draft', async () => {
  invoke.mockResolvedValue({ data: { overview: ' Reviewed draft. ' }, error: null });
  expect(await generateCategoryOverview('Navratri Specials')).toBe('Reviewed draft.');
  expect(invoke).toHaveBeenCalledWith('analyze-product', { body: { mode: 'category-overview', categoryName: 'Navratri Specials' } });
});
it.each([
  [{ error: 'Gemini model is unavailable.' }, 502, 'Gemini model is unavailable.'],
  [{ message: 'Invalid JWT' }, 401, 'Invalid JWT'],
])('shows the actual server or gateway error and HTTP status', async (body, status, message) => {
  invoke.mockResolvedValue({ data: null, error: {
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify(body), { status }),
  } });
  await expect(generateCategoryOverview('Navratri Specials')).rejects.toThrow(`${message} (HTTP ${status})`);
});
it('does not repeat the server fallback chain when all providers are busy', async () => {
  invoke
    .mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(JSON.stringify({ error: 'This model is currently experiencing high demand.' }), { status: 502 }),
      },
    });
  await expect(generateCategoryOverview('Navratri Specials')).rejects.toThrow('high demand');
  expect(invoke).toHaveBeenCalledTimes(1);
});
it('keeps HTTP diagnostics for non-JSON gateway responses', async () => {
  invoke.mockResolvedValue({ data: null, error: {
    message: 'Edge Function returned a non-2xx status code',
    context: new Response('Bad gateway', { status: 502 }),
  } });
  await expect(generateCategoryOverview('Navratri Specials')).rejects.toThrow('HTTP 502');
});
it('saves cover changes atomically with seasonal membership and supports legacy callers', async () => {
  rpc.mockResolvedValue({ data: '', error: null });
  await saveSeasonalCategory('Navratri', ['p1'], true, 'Reviewed.', false, '');
  expect(rpc).toHaveBeenLastCalledWith('save_seasonal_category', {
    category_name: 'Navratri', selected_product_ids: ['p1'], show_category: true,
    category_overview: 'Reviewed.', feature_in_ticker: false, category_cover_image: '',
  });
  await saveSeasonalCategory('Navratri', [], true);
  expect(rpc.mock.calls.at(-1)?.[1]).not.toHaveProperty('category_cover_image');
});
it('archives the original and uploads a converted cover using the same image ID', async () => {
  const file = new File(['image'], 'cover.png', { type: 'image/png' });
  const prepared = new File(['webp'], 'cover.webp', { type: 'image/webp' });
  vi.mocked(convertImageForUpload).mockResolvedValue(prepared);
  vi.mocked(archiveImageOriginal).mockResolvedValue('image-id');
  vi.mocked(uploadImageToR2).mockResolvedValue({ imagePath: 'r2:products/admin/image-id', imageUrl: 'https://images.luviacreations.com/products/admin/image-id.webp' });
  expect(await uploadSeasonalCategoryImage(file)).toContain('image-id.webp');
  expect(archiveImageOriginal).toHaveBeenCalledWith(file);
  expect(uploadImageToR2).toHaveBeenCalledWith(prepared, 'image-id');
});
it('rejects invalid cover files before conversion or upload', async () => {
  await expect(uploadSeasonalCategoryImage(new File(['svg'], 'cover.svg', { type: 'image/svg+xml' }))).rejects.toThrow('6 MB');
  expect(convertImageForUpload).not.toHaveBeenCalled();
});
it('deletes obsolete R2 covers using the rendition-aware storage helper', async () => {
  await removeSeasonalCategoryImages(['https://images.luviacreations.com/products/admin/old.webp', 'https://images.luviacreations.com/products/admin/old.webp']);
  expect(deleteImagesFromR2).toHaveBeenCalledExactlyOnceWith(['r2:products/admin/old']);
  await expect(removeSeasonalCategoryImages(['https://untrusted.test/old.webp'])).rejects.toThrow('invalid seasonal cover');
});
