import { beforeEach, describe, expect, it, vi } from 'vitest';
import { suggestVariantName } from './productAnalysis';

const mockInvoke = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

const imageFile = () => new File(['image'], 'variant.png', { type: 'image/png' });

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
