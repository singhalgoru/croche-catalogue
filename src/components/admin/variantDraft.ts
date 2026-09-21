export interface VariantDraft {
  key: string;
  name: string;
  color: string;
  inStock: boolean;
  imageFile: File | null;
  previewUrl: string | null;
  galleryFiles: File[];
  galleryPreviewUrls: string[];
}

export const createEmptyVariant = (name = ''): VariantDraft => ({
  key: crypto.randomUUID(),
  name,
  color: '#f6c453',
  inStock: true,
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
