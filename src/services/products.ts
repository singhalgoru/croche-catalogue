import type { Product } from '../types/product';
import { supabase } from '../lib/supabase';

interface ProductRow {
  id: string;
  name: string;
  category: Product['category'];
  description: string;
  color: string;
  in_stock: boolean;
  image_path: string;
  image_url: string;
  published: boolean;
  created_at: string;
}

export interface NewProduct {
  name: string;
  category: Product['category'];
  description: string;
  color: string;
  inStock: boolean;
  imageFile: File;
}

export interface ManagedProduct extends Product {
  imagePath: string;
  published: boolean;
  createdAt: string;
}

export interface ProductUpdate {
  name: string;
  category: Product['category'];
  description: string;
  color: string;
  inStock: boolean;
  published: boolean;
  imageFile?: File | null;
}

const PRODUCT_COLUMNS =
  'id, name, category, description, color, in_stock, image_path, image_url, published, created_at';

const requireSupabase = () => {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }

  return supabase;
};

const mapProductRow = (row: ProductRow): ManagedProduct => ({
  id: row.id,
  name: row.name,
  category: row.category,
  price: 0,
  description: row.description,
  color: row.color,
  inStock: row.in_stock,
  image: row.image_url,
  imagePath: row.image_path,
  published: row.published,
  createdAt: row.created_at,
});

export async function fetchPublishedProducts(): Promise<Product[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('published', true)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Unable to load uploaded products: ${error.message}`);
  }

  return (data as ProductRow[]).map(mapProductRow);
}

export async function fetchManagedProducts(): Promise<ManagedProduct[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('products')
    .select(PRODUCT_COLUMNS)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Unable to load products for management: ${error.message}`);
  }

  return (data as ProductRow[]).map(mapProductRow);
}

const getCurrentUser = async () => {
  const client = requireSupabase();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error) {
    throw new Error(`Unable to verify the admin account: ${error.message}`);
  }

  if (!user) {
    throw new Error('You must be signed in to manage catalogue products.');
  }

  return { client, user };
};

const uploadProductImage = async (file: File, userId: string) => {
  const client = requireSupabase();
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const imagePath = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage.from('product-images').upload(imagePath, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw new Error(`Unable to upload the product image: ${error.message}`);
  }

  const { data } = client.storage.from('product-images').getPublicUrl(imagePath);
  return { imagePath, imageUrl: data.publicUrl };
};

const removeManagedImage = async (imagePath: string, userId: string) => {
  if (!imagePath.startsWith(`${userId}/`)) return;

  const client = requireSupabase();
  const { error } = await client.storage.from('product-images').remove([imagePath]);
  if (error) {
    throw new Error(`Unable to remove the old product image: ${error.message}`);
  }
};

export async function publishProduct(product: NewProduct): Promise<Product> {
  const { client, user } = await getCurrentUser();
  const { imagePath, imageUrl } = await uploadProductImage(product.imageFile, user.id);
  const { data, error: insertError } = await client
    .from('products')
    .insert({
      name: product.name,
      category: product.category,
      description: product.description,
      color: product.color,
      in_stock: product.inStock,
      image_path: imagePath,
      image_url: imageUrl,
      published: true,
      created_by: user.id,
    })
    .select(PRODUCT_COLUMNS)
    .single();

  if (insertError) {
    const { error: cleanupError } = await client.storage.from('product-images').remove([imagePath]);
    const cleanupDetail = cleanupError ? ` Image cleanup also failed: ${cleanupError.message}` : '';
    throw new Error(`Unable to publish the product: ${insertError.message}.${cleanupDetail}`);
  }

  return mapProductRow(data as ProductRow);
}

export async function updateProduct(
  product: ManagedProduct,
  update: ProductUpdate,
): Promise<ManagedProduct> {
  const { client, user } = await getCurrentUser();
  let nextImage: { imagePath: string; imageUrl: string } | null = null;

  if (update.imageFile) {
    nextImage = await uploadProductImage(update.imageFile, user.id);
  }

  const changes: Record<string, unknown> = {
    name: update.name,
    category: update.category,
    description: update.description,
    color: update.color,
    in_stock: update.inStock,
    published: update.published,
    updated_at: new Date().toISOString(),
  };

  if (nextImage) {
    changes.image_path = nextImage.imagePath;
    changes.image_url = nextImage.imageUrl;
  }

  const { data, error } = await client
    .from('products')
    .update(changes)
    .eq('id', product.id)
    .select(PRODUCT_COLUMNS)
    .single();

  if (error) {
    if (nextImage) {
      try {
        await removeManagedImage(nextImage.imagePath, user.id);
      } catch (cleanupError) {
        throw new Error(
          `Unable to update ${product.name}: ${error.message}. The replacement image also could not be cleaned up: ${
            cleanupError instanceof Error ? cleanupError.message : 'Unknown cleanup error.'
          }`,
        );
      }
    }
    throw new Error(`Unable to update ${product.name}: ${error.message}`);
  }

  if (nextImage) {
    try {
      await removeManagedImage(product.imagePath, user.id);
    } catch (cleanupError) {
      throw new Error(
        `${product.name} was updated, but the old image could not be removed. ${
          cleanupError instanceof Error ? cleanupError.message : ''
        }`.trim(),
      );
    }
  }

  return mapProductRow(data as ProductRow);
}

export async function deleteProduct(product: ManagedProduct): Promise<void> {
  const { client, user } = await getCurrentUser();
  const { error } = await client.from('products').delete().eq('id', product.id);

  if (error) {
    throw new Error(`Unable to delete ${product.name}: ${error.message}`);
  }

  try {
    await removeManagedImage(product.imagePath, user.id);
  } catch (cleanupError) {
    throw new Error(
      `${product.name} was removed from the catalogue, but its stored image could not be deleted. ${
        cleanupError instanceof Error ? cleanupError.message : ''
      }`.trim(),
    );
  }
}
