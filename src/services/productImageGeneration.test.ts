import { describe, expect, it, vi } from 'vitest';
import { generateProductImage, optimizeProductImagePrompt } from './productImageGeneration';

const mockInvoke = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

describe('productImageGeneration', () => {
  it('rejects unsupported file formats before calling Supabase', async () => {
    const file = new File(['dummy'], 'sample.gif', { type: 'image/gif' });
    await expect(generateProductImage(file, 'studio')).rejects.toThrow(
      'Please choose a JPG, PNG, or WebP image.',
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('rejects files larger than 6 MB before calling Supabase', async () => {
    const largeBuffer = new Uint8Array(6 * 1024 * 1024 + 1);
    const file = new File([largeBuffer], 'large.jpg', { type: 'image/jpeg' });
    await expect(generateProductImage(file, 'studio')).rejects.toThrow(
      'Please choose an image smaller than 6 MB.',
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('invokes enhance-product-image with default auto provider', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=',
        mimeType: 'image/png',
        provider: 'cloudflare',
        model: '@cf/black-forest-labs/flux-2-klein-9b',
      },
      error: null,
    });

    const file = new File(['fake-image'], 'crochet.png', { type: 'image/png' });
    const result = await generateProductImage(file, 'studio', 'warm lighting');

    expect(mockInvoke).toHaveBeenCalledWith(
      'enhance-product-image',
      expect.objectContaining({
        body: expect.objectContaining({
          mode: 'studio',
          styleSuggestion: 'warm lighting',
          provider: 'auto',
          mimeType: 'image/png',
        }),
      }),
    );
    expect(result).toBeInstanceOf(File);
    expect(result.type).toBe('image/png');
    expect(result.name).toMatch(/^luvia-studio-\d+\.png$/);
  });

  it('passes explicit provider selection to enhance-product-image', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=',
        mimeType: 'image/png',
        provider: 'openai',
        model: 'dall-e-2',
      },
      error: null,
    });

    const file = new File(['fake-image'], 'crochet.png', { type: 'image/png' });
    const result = await generateProductImage(file, 'lifestyle', 'gift box', 'openai');

    expect(mockInvoke).toHaveBeenCalledWith(
      'enhance-product-image',
      expect.objectContaining({
        body: expect.objectContaining({
          mode: 'lifestyle',
          styleSuggestion: 'gift box',
          provider: 'openai',
        }),
      }),
    );
    expect(result).toBeInstanceOf(File);
    expect(result.type).toBe('image/png');
    expect(result.name).toMatch(/^luvia-lifestyle-\d+\.png$/);
  });

  it('rejects empty styling directions in optimizeProductImagePrompt', async () => {
    await expect(optimizeProductImagePrompt('   ')).rejects.toThrow(
      'Add a rough styling idea before optimizing the prompt.',
    );
  });

  it('returns optimized prompt from optimize-image-prompt function', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        prompt: 'Minimalist wooden table with morning light.',
      },
      error: null,
    });

    const prompt = await optimizeProductImagePrompt('wooden table');
    expect(mockInvoke).toHaveBeenCalledWith('optimize-image-prompt', {
      body: { styleDirection: 'wooden table' },
    });
    expect(prompt).toBe('Minimalist wooden table with morning light.');
  });
});
