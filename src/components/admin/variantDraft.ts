export interface VariantDraft {
  key: string;
  name: string;
  color: string;
  price: string;
  inStock: boolean;
  availableQuantity: number;
  imageFile: File | null;
  previewUrl: string | null;
  galleryFiles: File[];
  galleryPreviewUrls: string[];
}

export const createEmptyVariant = (name = ''): VariantDraft => ({
  key: crypto.randomUUID(),
  name,
  color: '#f6c453',
  price: '',
  inStock: true,
  availableQuantity: 1,
  imageFile: null,
  previewUrl: null,
  galleryFiles: [],
  galleryPreviewUrls: [],
});

export const releaseVariantPreviews = (variants: VariantDraft[]) => {
  for (const variant of variants) {
    if (variant.previewUrl) URL.revokeObjectURL(variant.previewUrl);
    for (const url of variant.galleryPreviewUrls) URL.revokeObjectURL(url);
  }
};
