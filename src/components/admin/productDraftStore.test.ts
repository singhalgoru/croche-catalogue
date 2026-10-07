import { describe, expect, it } from 'vitest';
import { createEmptyVariant } from './variantDraft';
import { createDefaultPriceInputs } from './priceDiscovery';
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

  it('preserves SEO-only drafts', () => {
    expect(isProductDraftEmpty(
      { ...EMPTY_PRODUCT_DRAFT, seoDescription: 'Handmade crochet bunny.' },
      [createEmptyVariant('Standard')],
    )).toBe(false);
  });

  it('preserves drafts with specifications even when basic fields are blank', () => {
    expect(isProductDraftEmpty(
      { ...EMPTY_PRODUCT_DRAFT, materials: 'Cotton yarn' },
      [createEmptyVariant('Standard')],
    )).toBe(false);
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
  it('retains pricing-only drafts and restores their cost inputs and minimum quantities', () => {
    const draft = { ...EMPTY_PRODUCT_DRAFT, minimumOrderQuantity: 4,
      priceDiscoveryInputs: { ...createDefaultPriceInputs(), timeSpent: '120', timeUnit: 'minutes' as const } };
    expect(isProductDraftEmpty(draft, [createEmptyVariant('Standard')])).toBe(false);
    expect(isProductDraftEmpty({ ...draft, minimumOrderQuantity: 1 }, [createEmptyVariant('Standard')])).toBe(false);
    const stored = toStoredProductDraft(draft, [createEmptyVariant('Standard')]);
    expect(fromStoredProductDraft(stored).draft).toEqual(draft);
  });

  it('restores old drafts with blank optional specifications', () => {
    const stored = toStoredProductDraft(EMPTY_PRODUCT_DRAFT, [createEmptyVariant('Standard')], 1000);
    const { seoDescription: _seo, materials: _materials, dimensions: _dimensions, includedItems: _included, careInstructions: _care, ...legacy } = stored.draft;
    const restored = fromStoredProductDraft({
      ...stored, draft: legacy,
    });
    expect(restored.draft.materials).toBe('');
    expect(restored.draft.dimensions).toBe('');
    expect(restored.draft.includedItems).toBe('');
    expect(restored.draft.careInstructions).toBe('');
    expect(restored.draft.seoDescription).toBe('');
  });

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
    const draft = { ...EMPTY_PRODUCT_DRAFT, name: 'Bunny', description: 'Soft and cuddly', seoDescription: 'Handmade crochet bunny.' };

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
