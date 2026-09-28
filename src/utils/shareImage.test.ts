import { afterEach, describe, expect, it, vi } from 'vitest';
import { getShareableImageFile, toShareFileName } from './shareImage';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('toShareFileName', () => {
  it('slugifies a product name', () => {
    expect(toShareFileName('Cute Bunny — Ivory')).toBe('cute-bunny-ivory');
  });

  it('falls back to a generic name when nothing usable remains', () => {
    expect(toShareFileName('!!!')).toBe('product');
  });
});

describe('getShareableImageFile', () => {
  it('returns a File built from a successful image response', async () => {
    const blob = new Blob(['fake-image-bytes'], { type: 'image/webp' });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });

    const file = await getShareableImageFile('https://example.com/rose.webp', 'crochet-rose');

    expect(file).not.toBeNull();
    expect(file?.name).toBe('crochet-rose.webp');
    expect(file?.type).toBe('image/webp');
  });

  it('returns null when the response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

    const file = await getShareableImageFile('https://example.com/missing.webp', 'crochet-rose');

    expect(file).toBeNull();
  });

  it('returns null when the response is not an image', async () => {
    const blob = new Blob(['<html></html>'], { type: 'text/html' });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });

    const file = await getShareableImageFile('https://example.com/rose.webp', 'crochet-rose');

    expect(file).toBeNull();
  });

  it('returns null when fetch throws (e.g. CORS or network failure)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'));

    const file = await getShareableImageFile('https://example.com/rose.webp', 'crochet-rose');

    expect(file).toBeNull();
  });
});
