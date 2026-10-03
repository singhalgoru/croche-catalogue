export interface ProductDetailValues {
  materials?: string;
  dimensions?: string;
  includedItems?: string;
  careInstructions?: string;
}

export const PRODUCT_DETAIL_FIELDS = [
  { key: 'materials', label: 'Materials' },
  { key: 'dimensions', label: 'Dimensions' },
  { key: 'includedItems', label: "What's included" },
  { key: 'careInstructions', label: 'Care instructions' },
] as const;
