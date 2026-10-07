export const VARIANT_COLUMNS =
  'id, public_slug, name, color, price, in_stock, available_quantity, image_path, image_url, sort_order, product_variant_images(id, image_path, image_url, sort_order)';
export const PRODUCT_COLUMNS =
  `id, public_slug, sort_order, name, category, description, seo_description, materials, dimensions, included_items, care_instructions, featured, price, show_price, color, in_stock, image_path, image_url, published, published_at, created_at, product_variants(${VARIANT_COLUMNS}), product_profit_margins(profit_margin_percent, gst_percent)`;
