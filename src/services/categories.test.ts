import { beforeEach, expect, it, vi } from 'vitest';
import { generateCategoryOverview, saveCategoryOverview, saveSeasonalCategory } from './categories';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({ functions: { invoke } }) }));
beforeEach(() => vi.clearAllMocks());
it('rejects saving overviews longer than 150 words on either category path', async () => {
  const overview = Array(151).fill('crochet').join(' ');
  await expect(saveCategoryOverview('Toys', overview)).rejects.toThrow('150 words');
  await expect(saveSeasonalCategory('Navratri', [], true, overview)).rejects.toThrow('150 words');
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
it('keeps HTTP diagnostics for non-JSON gateway responses', async () => {
  invoke.mockResolvedValue({ data: null, error: {
    message: 'Edge Function returned a non-2xx status code',
    context: new Response('Bad gateway', { status: 502 }),
  } });
  await expect(generateCategoryOverview('Navratri Specials')).rejects.toThrow('HTTP 502');
});
