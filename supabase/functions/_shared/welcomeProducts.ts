import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { WelcomeProduct } from './welcomeEmail.ts';

export async function fetchWelcomeProducts(admin: SupabaseClient): Promise<WelcomeProduct[]> {
  const { data: ranked, error } = await admin.rpc('get_catalogue_bestsellers');
  if (error || !ranked) throw new Error(`Unable to load bestsellers: ${error?.message ?? 'No response.'}`);
  const ids = ranked.slice(0, 3).map((row: { product_id: string }) => row.product_id);
  if (!ids.length) return [];
  const { data: products, error: productError } = await admin.from('products')
    .select('id,name,public_slug,product_variants(image_url,in_stock,available_quantity,sort_order)')
    .in('id', ids).eq('published', true);
  if (productError || !products) throw new Error(`Unable to load bestseller details: ${productError?.message ?? 'No response.'}`);
  return ids.flatMap((id: string) => {
    const product = products.find(row => row.id === id);
    if (!product?.public_slug) return [];
    const variant = product.product_variants
      .filter(row => row.in_stock && row.available_quantity > 0)
      .sort((a, b) => a.sort_order - b.sort_order)[0];
    if (!variant?.image_url) return [];
    const image = new URL(variant.image_url, 'https://luviacreations.com/');
    if (image.protocol !== 'https:') throw new Error('Bestseller image must use HTTPS.');
    return [{ name: product.name, url: `https://luviacreations.com/p/${encodeURIComponent(product.public_slug)}/`, image: image.href }];
  });
}
