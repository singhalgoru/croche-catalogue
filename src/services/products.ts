import { supabase } from '../lib/supabase';
import type { Product, ProductVariant, ProductVariantImage } from '../types/product';

interface ProductVariantImageRow {
  id: string;
  image_path: string;
  image_url: string;
  sort_order: number;
}

interface ProductVariantRow {
  id: string;
  name: string;
  color: string;
  in_stock: boolean;
  image_path: string;
  image_url: string;
  sort_order: number;
  product_variant_images?: ProductVariantImageRow[];
}

interface ProductRow {
  id: string;
  name: string;
  category: Product['category'];
  description: string;
  featured: boolean;
  price: number | null;
  show_price: boolean;
  color: string;
  in_stock: boolean;
  image_path: string;
  image_url: string;
  published: boolean;
  published_at: string | null;
  created_at: string;
  product_variants?: ProductVariantRow[];
}

export interface NewVariant {
  name: string;
  color: string;
  inStock: boolean;
  imageFile: File;
  /** Additional angle photos (e.g. top view, side view) uploaded alongside the main image. */
  galleryFiles?: File[];
}

export interface NewProduct {
  name: string;
  category: Product['category'];
  description: string;
  featured: boolean;
  price: number | null;
  showPrice: boolean;
  variants: NewVariant[];
}

export interface ManagedProduct extends Product {
  imagePath: string;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
}

export interface ProductUpdate {
  name: string;
  category: Product['category'];
  description: string;
  published: boolean;
  featured: boolean;
  price: number | null;
  showPrice: boolean;
}

export interface VariantUpdate {
  name: string;
  color: string;
  inStock: boolean;
  imageFile?: File | null;
}

const VARIANT_COLUMNS =
  'id, name, color, in_stock, image_path, image_url, sort_order, product_variant_images(id, image_path, image_url, sort_order)';
const PRODUCT_COLUMNS =
  `id, name, category, description, featured, price, show_price, color, in_stock, image_path, image_url, published, published_at, created_at, product_variants(${VARIANT_COLUMNS})`;

const requireSupabase = () => {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }
  return supabase;
};

const mapGalleryRow = (row: ProductVariantImageRow): ProductVariantImage => ({
  id: row.id,
  image: row.image_url,
  imagePath: row.image_path,
});

const mapVariantRow = (row: ProductVariantRow): ProductVariant => ({
  id: row.id,
  name: row.name,
  color: row.color,
  inStock: row.in_stock,
  image: row.image_url,
  imagePath: row.image_path,
  gallery: [...(row.product_variant_images ?? [])]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map(mapGalleryRow),
});

const mapProductRow = (row: ProductRow): ManagedProduct => {
  const variants = [...(row.product_variants ?? [])]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map(mapVariantRow);
  const fallbackVariant: ProductVariant = {
    id: `${row.id}-default`,
    name: 'Default',
    color: row.color,
    inStock: row.in_stock,
    image: row.image_url,
    imagePath: row.image_path,
    gallery: [],
  };
  const resolvedVariants = variants.length > 0 ? variants : [fallbackVariant];
  const primaryVariant = resolvedVariants[0];

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    showPrice: row.show_price,
    description: row.description,
    featured: row.featured,
    color: primaryVariant.color,
    inStock: resolvedVariants.some((variant) => variant.inStock),
    image: primaryVariant.image,
    imagePath: primaryVariant.imagePath,
    variants: resolvedVariants,
    published: row.published,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
};

const getCurrentUser = async () => {
  const client = requireSupabase();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error) throw new Error(`Unable to verify the admin account: ${error.message}`);
  if (!user) throw new Error('You must be signed in to manage catalogue products.');
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

  if (error) throw new Error(`Unable to upload the product image: ${error.message}`);
  const { data } = client.storage.from('product-images').getPublicUrl(imagePath);
  return { imagePath, imageUrl: data.publicUrl };
};

const removeManagedImage = async (imagePath: string, userId: string) => {
  if (!imagePath.startsWith(`${userId}/`)) return;
  const client = requireSupabase();
  const { error } = await client.storage.from('product-images').remove([imagePath]);
  if (error) throw new Error(`Unable to remove a product image: ${error.message}`);
};

const cleanupUploadedImages = async (paths: string[]) => {
  if (paths.length === 0) return;
  const client = requireSupabase();
  const { error } = await client.storage.from('product-images').remove(paths);
  if (error) throw new Error(`Image cleanup failed: ${error.message}`);
};

const fetchProductById = async (productId: string): Promise<ManagedProduct> => {
  const client = requireSupabase();
  const { data, error } = await client
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('id', productId)
    .single();
  if (error) throw new Error(`Unable to reload the product: ${error.message}`);
  return mapProductRow(data as ProductRow);
};

const syncProductSummary = async (productId: string) => {
  const product = await fetchProductById(productId);
  const primary = product.variants[0];
  const client = requireSupabase();
  const { error } = await client
    .from('products')
    .update({
      color: primary.color,
      in_stock: product.variants.some((variant) => variant.inStock),
      image_path: primary.imagePath,
      image_url: primary.image,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId);
  if (error) throw new Error(`Unable to update the product preview: ${error.message}`);
};

export async function fetchPublishedProducts(): Promise<Product[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('published', true)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Unable to load uploaded products: ${error.message}`);
  return (data as ProductRow[]).map(mapProductRow);
}

export async function fetchManagedProducts(): Promise<ManagedProduct[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('products')
    .select(PRODUCT_COLUMNS)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Unable to load products for management: ${error.message}`);
  return (data as ProductRow[]).map(mapProductRow);
}

export async function publishProduct(product: NewProduct): Promise<Product> {
  if (product.variants.length === 0) throw new Error('Add at least one product variant.');
  const { client, user } = await getCurrentUser();
  const uploads: Array<{ imagePath: string; imageUrl: string }> = [];

  try {
    for (const variant of product.variants) {
      uploads.push(await uploadProductImage(variant.imageFile, user.id));
    }

    const primary = product.variants[0];
    const primaryUpload = uploads[0];
    const { data, error: productError } = await client
      .from('products')
      .insert({
        name: product.name,
        category: product.category,
        description: product.description,
        featured: product.featured,
        price: product.price,
        show_price: product.showPrice,
        color: primary.color,
        in_stock: product.variants.some((variant) => variant.inStock),
        image_path: primaryUpload.imagePath,
        image_url: primaryUpload.imageUrl,
        published: true,
        created_by: user.id,
      })
      .select('id')
      .single();
    if (productError) throw new Error(`Unable to publish the product: ${productError.message}`);

    const productId = (data as { id: string }).id;

    for (const [index, variant] of product.variants.entries()) {
      const { data: variantData, error: variantError } = await client
        .from('product_variants')
        .insert({
          product_id: productId,
          name: variant.name.trim(),
          color: variant.color,
          in_stock: variant.inStock,
          image_path: uploads[index].imagePath,
          image_url: uploads[index].imageUrl,
          sort_order: index,
        })
        .select('id')
        .single();
      if (variantError) {
        await client.from('products').delete().eq('id', productId);
        throw new Error(`Unable to publish product variants: ${variantError.message}`);
      }

      const variantId = (variantData as { id: string }).id;
      const galleryFiles = variant.galleryFiles ?? [];
      for (const [galleryIndex, file] of galleryFiles.entries()) {
        const galleryUpload = await uploadProductImage(file, user.id);
        uploads.push(galleryUpload);
        const { error: galleryError } = await client.from('product_variant_images').insert({
          variant_id: variantId,
          image_path: galleryUpload.imagePath,
          image_url: galleryUpload.imageUrl,
          sort_order: galleryIndex,
        });
        if (galleryError) {
          await client.from('products').delete().eq('id', productId);
          throw new Error(`Unable to publish variant gallery images: ${galleryError.message}`);
        }
      }
    }

    return await fetchProductById(productId);
  } catch (error) {
    try {
      await cleanupUploadedImages(uploads.map((upload) => upload.imagePath));
    } catch (cleanupError) {
      throw new Error(
        `${error instanceof Error ? error.message : 'Unable to publish the product.'} ${
          cleanupError instanceof Error ? cleanupError.message : ''
        }`.trim(),
      );
    }
    throw error;
  }
}

export async function updateProduct(
  product: ManagedProduct,
  update: ProductUpdate,
): Promise<ManagedProduct> {
  const { client } = await getCurrentUser();
  const { error } = await client
    .from('products')
    .update({
      name: update.name,
      category: update.category,
      description: update.description,
      published: update.published,
      featured: update.featured,
      price: update.price,
      show_price: update.showPrice,
      updated_at: new Date().toISOString(),
    })
    .eq('id', product.id);
  if (error) throw new Error(`Unable to update ${product.name}: ${error.message}`);
  return fetchProductById(product.id);
}

export async function addProductVariant(
  product: ManagedProduct,
  variant: NewVariant,
): Promise<ManagedProduct> {
  const { client, user } = await getCurrentUser();
  const upload = await uploadProductImage(variant.imageFile, user.id);
  const galleryUploads: Array<{ imagePath: string; imageUrl: string }> = [];

  try {
    const { data, error } = await client
      .from('product_variants')
      .insert({
        product_id: product.id,
        name: variant.name.trim(),
        color: variant.color,
        in_stock: variant.inStock,
        image_path: upload.imagePath,
        image_url: upload.imageUrl,
        sort_order: product.variants.length,
      })
      .select('id')
      .single();
    if (error) throw new Error(`Unable to add the variant: ${error.message}`);

    const variantId = (data as { id: string }).id;
    const galleryFiles = variant.galleryFiles ?? [];
    for (const [galleryIndex, file] of galleryFiles.entries()) {
      const galleryUpload = await uploadProductImage(file, user.id);
      galleryUploads.push(galleryUpload);
      const { error: galleryError } = await client.from('product_variant_images').insert({
        variant_id: variantId,
        image_path: galleryUpload.imagePath,
        image_url: galleryUpload.imageUrl,
        sort_order: galleryIndex,
      });
      if (galleryError) throw new Error(`Unable to add the gallery image: ${galleryError.message}`);
    }
  } catch (error) {
    await cleanupUploadedImages([upload.imagePath, ...galleryUploads.map((item) => item.imagePath)]);
    throw error;
  }

  await syncProductSummary(product.id);
  return fetchProductById(product.id);
}

export async function addVariantGalleryImage(
  product: ManagedProduct,
  variant: ProductVariant,
  imageFile: File,
): Promise<ManagedProduct> {
  const { client, user } = await getCurrentUser();
  const upload = await uploadProductImage(imageFile, user.id);
  const { error } = await client.from('product_variant_images').insert({
    variant_id: variant.id,
    image_path: upload.imagePath,
    image_url: upload.imageUrl,
    sort_order: variant.gallery.length,
  });
  if (error) {
    await cleanupUploadedImages([upload.imagePath]);
    throw new Error(`Unable to add the gallery image: ${error.message}`);
  }
  return fetchProductById(product.id);
}

export async function deleteVariantGalleryImage(
  product: ManagedProduct,
  image: ProductVariantImage,
): Promise<ManagedProduct> {
  const { client, user } = await getCurrentUser();
  const { data, error } = await client
    .from('product_variant_images')
    .delete()
    .eq('id', image.id)
    .select('id');
  if (error) throw new Error(`Unable to remove the gallery image: ${error.message}`);
  // A blocked row-level-security policy reports success with zero rows
  // affected instead of an error, which previously left the thumbnail
  // looking "stuck" after pressing the remove button. Surface that as a
  // real error instead of silently doing nothing.
  if (!data || data.length === 0) {
    throw new Error(
      'Unable to remove the gallery image: it may have already been removed or you may not have permission.',
    );
  }
  await removeManagedImage(image.imagePath, user.id);
  return fetchProductById(product.id);
}

export async function setVariantMainImage(
  product: ManagedProduct,
  variant: ProductVariant,
  image: ProductVariantImage,
): Promise<ManagedProduct> {
  const { client } = await getCurrentUser();
  // Swap the two rows' image references rather than moving storage files:
  // the chosen gallery image becomes the variant's main photo, and the
  // previous main photo takes its place in the gallery.
  const { data: variantData, error: variantError } = await client
    .from('product_variants')
    .update({
      image_path: image.imagePath,
      image_url: image.image,
      updated_at: new Date().toISOString(),
    })
    .eq('id', variant.id)
    .select('id');
  if (variantError) throw new Error(`Unable to set the main image: ${variantError.message}`);
  if (!variantData || variantData.length === 0) {
    throw new Error('Unable to set the main image: no matching variant row was updated.');
  }

  const { data: galleryData, error: galleryError } = await client
    .from('product_variant_images')
    .update({ image_path: variant.imagePath, image_url: variant.image })
    .eq('id', image.id)
    .select('id');
  if (galleryError) throw new Error(`Unable to set the main image: ${galleryError.message}`);
  // Row-level-security policies that block the update (e.g. a missing
  // UPDATE policy) report success with zero rows affected rather than an
  // error, which previously left the old main image swapped away with no
  // gallery row taking its place. Fail loudly instead of corrupting data.
  if (!galleryData || galleryData.length === 0) {
    throw new Error('Unable to set the main image: no matching gallery row was updated.');
  }

  await syncProductSummary(product.id);
  return fetchProductById(product.id);
}

export async function updateProductVariant(
  product: ManagedProduct,
  variant: ProductVariant,
  update: VariantUpdate,
): Promise<ManagedProduct> {
  const { client, user } = await getCurrentUser();
  const upload = update.imageFile ? await uploadProductImage(update.imageFile, user.id) : null;
  const { error } = await client
    .from('product_variants')
    .update({
      name: update.name.trim(),
      color: update.color,
      in_stock: update.inStock,
      ...(upload ? { image_path: upload.imagePath, image_url: upload.imageUrl } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', variant.id);

  if (error) {
    if (upload) await cleanupUploadedImages([upload.imagePath]);
    throw new Error(`Unable to update the variant: ${error.message}`);
  }
  if (upload) await removeManagedImage(variant.imagePath, user.id);
  await syncProductSummary(product.id);
  return fetchProductById(product.id);
}

export async function deleteProductVariant(
  product: ManagedProduct,
  variant: ProductVariant,
): Promise<ManagedProduct> {
  if (product.variants.length <= 1) throw new Error('Every product must keep at least one variant.');
  const { client, user } = await getCurrentUser();
  const { error } = await client.from('product_variants').delete().eq('id', variant.id);
  if (error) throw new Error(`Unable to delete the variant: ${error.message}`);
  await removeManagedImage(variant.imagePath, user.id);
  for (const image of variant.gallery) {
    await removeManagedImage(image.imagePath, user.id);
  }
  await syncProductSummary(product.id);
  return fetchProductById(product.id);
}

export async function deleteProduct(product: ManagedProduct): Promise<void> {
  const { client, user } = await getCurrentUser();
  const { error } = await client.from('products').delete().eq('id', product.id);
  if (error) throw new Error(`Unable to delete ${product.name}: ${error.message}`);
  for (const variant of product.variants) {
    await removeManagedImage(variant.imagePath, user.id);
    for (const image of variant.gallery) {
      await removeManagedImage(image.imagePath, user.id);
    }
  }
}
