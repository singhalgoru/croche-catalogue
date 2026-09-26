export const VARIANT_COLUMNS =
  'id, name, color, price, in_stock, available_quantity, image_path, image_url, sort_order, product_variant_images(id, image_path, image_url, sort_order)';
export const PRODUCT_COLUMNS =
  `id, name, category, description, featured, price, show_price, color, in_stock, image_path, image_url, published, published_at, created_at, product_variants(${VARIANT_COLUMNS})`;
