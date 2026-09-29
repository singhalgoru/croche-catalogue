import { describe, expect, it } from 'vitest';
import { createEmptyVariant } from './variantDraft';
import {
  DRAFT_MAX_AGE_MS,
  EMPTY_PRODUCT_DRAFT,
  fromStoredProductDraft,
  isProductDraftEmpty,
  isStoredDraftUsable,
  toStoredProductDraft,
} from './productDraftStore';

const photo = () => new File(['bytes'], 'bunny.webp', { type: 'image/webp' });

describe('isProductDraftEmpty', () => {
  it('treats the untouched form as empty', () => {
    expect(isProductDraftEmpty(EMPTY_PRODUCT_DRAFT, [createEmptyVariant('Standard')])).toBe(true);
  });

  it('counts a typed name as work worth keeping', () => {
    expect(
      isProductDraftEmpty({ ...EMPTY_PRODUCT_DRAFT, name: 'Bunny' }, [createEmptyVariant('Standard')]),
    ).toBe(false);
  });

  it('counts an uploaded photo as work worth keeping', () => {
    const variant = { ...createEmptyVariant('Standard'), imageFile: photo() };
    expect(isProductDraftEmpty(EMPTY_PRODUCT_DRAFT, [variant])).toBe(false);
  });

  it('counts an extra variant as work worth keeping', () => {
    expect(
      isProductDraftEmpty(EMPTY_PRODUCT_DRAFT, [
        createEmptyVariant('Standard'),
        createEmptyVariant(''),
      ]),
    ).toBe(false);
  });
});

describe('stored product drafts', () => {
  it('round-trips photos and rebuilds their previews', () => {
    const imageFile = photo();
    const galleryFile = photo();
    const variant = {
      ...createEmptyVariant('Pink'),
      imageFile,
      previewUrl: 'blob:stale-main',
      galleryFiles: [galleryFile],
      galleryPreviewUrls: ['blob:stale-gallery'],
    };
    const draft = { ...EMPTY_PRODUCT_DRAFT, name: 'Bunny', description: 'Soft and cuddly' };

    const stored = toStoredProductDraft(draft, [variant], 1000);
    expect(stored.savedAt).toBe(1000);
    expect(stored.variants[0]).not.toHaveProperty('previewUrl');
    expect(stored.variants[0]).not.toHaveProperty('galleryPreviewUrls');

    let created = 0;
    const restored = fromStoredProductDraft(stored, () => `blob:fresh-${++created}`);
    expect(restored.draft).toEqual(draft);
    expect(restored.variants[0].imageFile).toBe(imageFile);
    expect(restored.variants[0].galleryFiles).toEqual([galleryFile]);
    expect(restored.variants[0].previewUrl).toBe('blob:fresh-1');
    expect(restored.variants[0].galleryPreviewUrls).toEqual(['blob:fresh-2']);
  });

  it('rejects drafts that are stale or malformed', () => {
    const stored = toStoredProductDraft(EMPTY_PRODUCT_DRAFT, [createEmptyVariant('Standard')], 0);
    expect(isStoredDraftUsable(stored, DRAFT_MAX_AGE_MS)).toBe(true);
    expect(isStoredDraftUsable(stored, DRAFT_MAX_AGE_MS + 1)).toBe(false);
    expect(isStoredDraftUsable({ ...stored, variants: [] }, 0)).toBe(false);
    expect(isStoredDraftUsable(null, 0)).toBe(false);
    expect(isStoredDraftUsable('draft', 0)).toBe(false);
  });
});
