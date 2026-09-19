import type { Product } from '../types/product';
import { supabase } from '../lib/supabase';

interface ProductRow {
  id: string;
  name: string;
  category: Product['category'];
  description: string;
  color: string;
  in_stock: boolean;
  image_url: string;
}

export interface NewProduct {
  name: string;
  category: Product['category'];
  description: string;
  color: string;
  inStock: boolean;
  imageFile: File;
}

const requireSupabase = () => {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }

  return supabase;
};

const mapProductRow = (row: ProductRow): Product => ({
  id: row.id,
  name: row.name,
  category: row.category,
  price: 0,
  description: row.description,
  color: row.color,
  inStock: row.in_stock,
  image: row.image_url,
});

export async function fetchPublishedProducts(): Promise<Product[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('products')
    .select('id, name, category, description, color, in_stock, image_url')
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Unable to load uploaded products: ${error.message}`);
  }

  return (data as ProductRow[]).map(mapProductRow);
}

export async function publishProduct(product: NewProduct): Promise<Product> {
  const client = requireSupabase();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError) {
    throw new Error(`Unable to verify the admin account: ${userError.message}`);
  }

  if (!user) {
    throw new Error('You must be signed in before publishing a product.');
  }

  const extension = product.imageFile.name.split('.').pop()?.toLowerCase() || 'jpg';
  const imagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await client.storage
    .from('product-images')
    .upload(imagePath, product.imageFile, {
      contentType: product.imageFile.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Unable to upload the product image: ${uploadError.message}`);
  }

  const { data: publicUrlData } = client.storage.from('product-images').getPublicUrl(imagePath);
  const { data, error: insertError } = await client
    .from('products')
    .insert({
      name: product.name,
      category: product.category,
      description: product.description,
      color: product.color,
      in_stock: product.inStock,
      image_path: imagePath,
      image_url: publicUrlData.publicUrl,
      published: true,
      created_by: user.id,
    })
    .select('id, name, category, description, color, in_stock, image_url')
    .single();

  if (insertError) {
    const { error: cleanupError } = await client.storage.from('product-images').remove([imagePath]);
    const cleanupDetail = cleanupError ? ` Image cleanup also failed: ${cleanupError.message}` : '';
    throw new Error(`Unable to publish the product: ${insertError.message}.${cleanupDetail}`);
  }

  return mapProductRow(data as ProductRow);
}
