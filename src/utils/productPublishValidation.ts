export interface PublishDetails {
  name: string;
  category: string;
  description: string;
  materials?: string;
  includedItems?: string;
  price: number | null;
  showPrice: boolean;
}

export function getProductPublishError(product: PublishDetails): string | null {
  if (product.name.trim().length < 2) return 'Enter a product name with at least 2 characters.';
  if (!product.category.trim()) return 'Choose a product category.';
  if (product.description.trim().length < 10) return 'Enter a description with at least 10 characters.';
  if (!product.materials?.trim()) return 'Add the product materials before publishing.';
  if (!product.includedItems?.trim()) return 'Describe what is included before publishing.';
  if (product.showPrice && (product.price === null || !Number.isInteger(product.price) || product.price <= 0)) {
    return 'Enter a positive whole-rupee price before showing it in the catalogue.';
  }
  return null;
}
