export interface VariantDraft {
  key: string;
  name: string;
  color: string;
  inStock: boolean;
  imageFile: File | null;
  previewUrl: string | null;
}

export const createEmptyVariant = (name = ''): VariantDraft => ({
  key: crypto.randomUUID(),
  name,
  color: '#f6c453',
  inStock: true,
  imageFile: null,
  previewUrl: null,
});

export const releaseVariantPreviews = (variants: VariantDraft[]) => {
  for (const variant of variants) {
    if (variant.previewUrl) URL.revokeObjectURL(variant.previewUrl);
  }
};
