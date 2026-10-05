import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeProductImage, suggestVariantName } from './productAnalysis';

const mockInvoke = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

const imageFile = () => new File(['image'], 'variant.png', { type: 'image/png' });

describe('analyzeProductImage', () => {
  const analysis = {
    name: ' Bunny Keychain ',
    category: 'Accessories',
    description: ' A lavender bunny. ',
    seoDescription: 'Handmade lavender crochet bunny keychain.',
    color: '#B57EDC',
  };
  beforeEach(() => mockInvoke.mockReset());

  it('preserves the image-only API with SEO copy and no optional specifications', async () => {
    mockInvoke.mockResolvedValue({ data: analysis, error: null });
    expect(await analyzeProductImage(imageFile(), ['Accessories'])).toEqual({
      ...analysis, name: 'Bunny Keychain', description: 'A lavender bunny.',
    });

    expect(mockInvoke.mock.calls[0][1].body).not.toHaveProperty('context');
  });

  it('accepts exactly 160 SEO characters and includes existing SEO copy in context', async () => {
    const seoDescription = `${'a'.repeat(159)}.`;
    mockInvoke.mockResolvedValue({ data: { ...analysis, seoDescription }, error: null });
    expect(await analyzeProductImage(imageFile(), ['Accessories'], { seoDescription }))
      .toHaveProperty('seoDescription', seoDescription);
    expect(mockInvoke.mock.calls[0][1].body.context.seoDescription).toBe(seoDescription);
  });

  it('sends trimmed notes and current details and returns all optional fields', async () => {
    const details = {
      materials: ' Cotton ', dimensions: ' 10 cm ',
      includedItems: ' One keychain ', careInstructions: ' Spot clean ',
    };
    mockInvoke.mockResolvedValue({ data: { ...analysis, ...details }, error: null });
    expect(await analyzeProductImage(imageFile(), ['Accessories'], {
      ...details, notes: ' Cotton; 10 cm; one keychain; spot clean ',
      name: ' Bunny ', category: 'Accessories', description: ' Handmade bunny ',
    })).toMatchObject({
      materials: 'Cotton', dimensions: '10 cm',
      includedItems: 'One keychain', careInstructions: 'Spot clean',
    });
    expect(mockInvoke.mock.calls[0][1].body.context).toEqual({
      notes: 'Cotton; 10 cm; one keychain; spot clean',
      name: 'Bunny', category: 'Accessories', description: 'Handmade bunny',
      materials: 'Cotton', dimensions: '10 cm',
      includedItems: 'One keychain', careInstructions: 'Spot clean',
    });
  });

  it('accepts exact note/detail limits and preserves intentional blanks', async () => {
    mockInvoke.mockResolvedValue({ data: { ...analysis, materials: ' ' }, error: null });
    expect(await analyzeProductImage(imageFile(), ['Accessories'], {
      notes: 'a'.repeat(2000), dimensions: 'b'.repeat(1000),
    })).toHaveProperty('materials', '');
  });

  it.each([
    { seoDescription: 'a'.repeat(161) },
    { notes: 'a'.repeat(2001) },
    { materials: 'a'.repeat(1001) },
    { dimensions: 'a'.repeat(1001) },
    { includedItems: 'a'.repeat(1001) },
    { careInstructions: 'a'.repeat(1001) },
  ])('rejects oversized context before invoking the function', async (context) => {
    await expect(analyzeProductImage(imageFile(), ['Accessories'], context)).rejects.toThrow('at most');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'x'.repeat(161), 'Cut off…', 'Cut off...', '<b>Bunny.</b>', 'No punctuation'])(
    'rejects invalid SEO suggestions rather than truncating them', async (seoDescription) => {
      mockInvoke.mockResolvedValue({ data: { ...analysis, seoDescription }, error: null });
      await expect(analyzeProductImage(imageFile(), ['Accessories'])).rejects.toThrow('invalid SEO description');
    },
  );

  it.each([null, 3, {}, 'a'.repeat(1001)])('rejects malformed optional output (%s)', async (materials) => {
    mockInvoke.mockResolvedValue({ data: { ...analysis, materials }, error: null });
    await expect(analyzeProductImage(imageFile(), ['Accessories'])).rejects.toThrow('optional product details');
  });

  it('surfaces function validation errors and rejects invalid categories', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null, error: { message: 'Bad request', context: new Response(JSON.stringify({ error: 'Invalid notes' })) },
    });
    await expect(analyzeProductImage(imageFile(), ['Accessories'])).rejects.toThrow('Invalid notes');
    mockInvoke.mockResolvedValueOnce({ data: { ...analysis, category: 'Unknown' }, error: null });
    await expect(analyzeProductImage(imageFile(), ['Accessories'])).rejects.toThrow('invalid product details');
  });
});

describe('suggestVariantName', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('sends the variant image with product context in variant-name mode', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { name: ' Ocean Blue ', color: '#3B82C4' },
      error: null,
    });

    const suggestion = await suggestVariantName(imageFile(), {
      productName: ' Bunny Keychain ',
      existingVariantNames: ['Lavender', ' ', 'Rose Pink'],
    });

    expect(suggestion).toEqual({ name: 'Ocean Blue', color: '#3b82c4' });
    expect(mockInvoke).toHaveBeenCalledWith('analyze-product', {
      body: expect.objectContaining({
        mode: 'variant-name',
        mimeType: 'image/png',
        productName: 'Bunny Keychain',
        existingVariantNames: ['Lavender', 'Rose Pink'],
      }),
    });
  });

  it('rejects suggestions that duplicate an existing variant name', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { name: 'lavender', color: '#b57edc' },
      error: null,
    });

    await expect(
      suggestVariantName(imageFile(), { existingVariantNames: ['Lavender'] }),
    ).rejects.toThrow('already used');
  });

  it('rejects incomplete suggestions', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { name: 'Mint' }, error: null });

    await expect(suggestVariantName(imageFile())).rejects.toThrow('incomplete');
  });

  it('rejects non-image files before calling Supabase', async () => {
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' });

    await expect(suggestVariantName(file)).rejects.toThrow('Please select an image file.');
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
