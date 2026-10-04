import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchManagedProducts, fetchPublishedProducts, publishProduct, updateProduct,
  type NewProduct, type ProductUpdate,
} from './products';
import { PRODUCT_COLUMNS } from './productColumns';

const { from, getUser, upload, archive, convert } = vi.hoisted(() => ({
  from: vi.fn(), getUser: vi.fn(), upload: vi.fn(), archive: vi.fn(), convert: vi.fn(),
}));
vi.mock('../lib/supabaseConfig', () => ({
  loadSupabase: async () => ({ from, auth: { getUser } }),
}));
vi.mock('../utils/imageUploadConversion', () => ({ convertImageForUpload: convert }));
vi.mock('./imageOriginals', () => ({ archiveImageOriginal: archive }));
vi.mock('./r2ImageStorage', () => ({
  uploadImageToR2: upload, deleteImagesFromR2: vi.fn(), isR2ImagePath: () => true,
  R2_IMAGE_PATH_PREFIX: 'r2:',
}));

const row = {
  id: 'p1', public_slug: 'bunny', name: 'Bunny', category: 'Accessories', description: 'Crochet bunny',
  price: 300, show_price: true, featured: false, color: '#B57EDC', in_stock: true,
  image_url: 'https://images.luviacreations.com/products/admin/bunny.webp',
  image_path: 'r2:products/admin/bunny', published: true, published_at: null,
  sort_order: 0, created_at: '2026-10-03T00:00:00Z',
};
const draft: NewProduct = {
  name: row.name, category: row.category, description: row.description, price: row.price,
  showPrice: true, featured: false,
  variants: [{
    name: 'Lavender', color: row.color, price: null, inStock: true, availableQuantity: 2,
    imageFile: new File(['image'], 'bunny.png', { type: 'image/png' }),
  }],
};
const update: ProductUpdate = {
  name: row.name, category: row.category, description: row.description,
  published: true, featured: false, price: row.price, showPrice: true,
};

function queueQuery(data: unknown, error: { message: string } | null = null) {
  const response = { data, error };
  const query = {
    select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(),
    insert: vi.fn(), update: vi.fn(), single: vi.fn(),
    then: (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve),
  };
  for (const method of ['select', 'eq', 'order', 'limit', 'insert', 'update'] as const) {
    query[method].mockReturnValue(query);
  }
  query.single.mockResolvedValue(response);
  from.mockReturnValueOnce(query);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  from.mockReset();
  window.cataloguePrefetch = undefined;
  getUser.mockResolvedValue({ data: { user: { id: 'admin' } }, error: null });
  convert.mockImplementation(async (file: File) => file);
  archive.mockResolvedValue('image-id');
  upload.mockResolvedValue({ imagePath: row.image_path, imageUrl: row.image_url });
});

describe('product detail loading', () => {
  it('selects and maps all four details for public and admin products', async () => {
    const detailedRow = {
      ...row, materials: ' Cotton ', dimensions: ' 10 cm ', included_items: ' 1 keychain ',
      care_instructions: ' Spot clean ',
    };
    const published = queueQuery([detailedRow]);
    const managed = queueQuery([detailedRow]);
    const loadedProducts = [await fetchPublishedProducts(), await fetchManagedProducts()];
    for (const products of loadedProducts) {
      expect(products[0]).toMatchObject({
        materials: 'Cotton', dimensions: '10 cm', includedItems: '1 keychain', careInstructions: 'Spot clean',
        price: 300, inStock: true,
      });
    }
    expect(published.select).toHaveBeenCalledWith(PRODUCT_COLUMNS);
    expect(managed.select).toHaveBeenCalledWith(PRODUCT_COLUMNS);
    expect(PRODUCT_COLUMNS).toContain('included_items, care_instructions');
    expect(PRODUCT_COLUMNS).toContain('public_slug');
    expect(loadedProducts[0][0].publicSlug).toBe('bunny');
    expect(loadedProducts[1][0].publicSlug).toBe('bunny');
  });

  it('keeps old, null and blank rows valid, including catalogue prefetch', async () => {
    window.cataloguePrefetch = Promise.resolve([{
      ...row, materials: null, dimensions: ' ', included_items: '', care_instructions: null,
    }]);
    const [product] = await fetchPublishedProducts();
    expect(product).toMatchObject({
      materials: undefined, dimensions: undefined, includedItems: undefined, careInstructions: undefined,
      price: 300, inStock: true,
    });
    expect(window.cataloguePrefetch).toBeUndefined();
    expect(from).not.toHaveBeenCalled();
    queueQuery([row]);
    expect((await fetchManagedProducts())[0].materials).toBeUndefined();
  });
});

describe('product detail persistence', () => {
  it('stores trimmed snake-case details during upload and returns them on reload', async () => {
    queueQuery([]);
    const insert = queueQuery({ id: row.id });
    queueQuery({ id: 'variant-1' });
    queueQuery({ ...row, materials: 'Cotton', dimensions: '10 cm', included_items: '1 keychain', care_instructions: 'Spot clean' });
    const product = await publishProduct({
      ...draft, materials: ' Cotton ', dimensions: ' 10 cm ', includedItems: ' 1 keychain ', careInstructions: ' Spot clean ',
    });
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({
      materials: 'Cotton', dimensions: '10 cm', included_items: '1 keychain', care_instructions: 'Spot clean',
      price: 300, in_stock: true,
    }));
    expect(product.includedItems).toBe('1 keychain');
  });

  it('allows edits to clear details without overwriting omitted fields', async () => {
    queueQuery([{ ...row, materials: 'Cotton', dimensions: '10 cm' }]);
    const [product] = await fetchManagedProducts();
    const write = queueQuery(null);
    queueQuery({ ...row, materials: null, dimensions: '10 cm', included_items: '1 keychain', care_instructions: 'Spot clean' });
    const edited = await updateProduct(product, {
      ...update, materials: ' ', includedItems: ' 1 keychain ', careInstructions: ' Spot clean ',
    });
    const payload = write.update.mock.calls[0][0];
    expect(payload).toMatchObject({ materials: null, included_items: '1 keychain', care_instructions: 'Spot clean', price: 300 });
    expect(payload).not.toHaveProperty('dimensions');
    expect(payload).not.toHaveProperty('in_stock');
    expect(payload).not.toHaveProperty('available_quantity');
    expect(edited.materials).toBeUndefined();
    expect(edited.dimensions).toBe('10 cm');
  });

  it('keeps legacy upload payloads valid and does not invent new details', async () => {
    queueQuery([]);
    const insert = queueQuery({ id: row.id });
    queueQuery({ id: 'variant-1' });
    queueQuery(row);
    await publishProduct(draft);
    expect(insert.insert.mock.calls[0][0]).not.toHaveProperty('materials');
  });

  it('rejects overlong details before uploads and propagates database errors', async () => {
    await expect(publishProduct({ ...draft, dimensions: 'x'.repeat(1001) })).rejects.toThrow('at most');
    expect(upload).not.toHaveBeenCalled();
    queueQuery([row]);
    const [product] = await fetchManagedProducts();
    await expect(updateProduct(product, { ...update, materials: 'x'.repeat(1001) })).rejects.toThrow('at most');
    queueQuery(null, { message: 'Database unavailable' });
    await expect(updateProduct(product, { ...update, dimensions: '10 cm' })).rejects.toThrow('Database unavailable');
  });

  it('accepts the exact database detail limit', async () => {
    queueQuery([]);
    const insert = queueQuery({ id: row.id });
    queueQuery({ id: 'variant-1' });
    queueQuery(row);
    await publishProduct({ ...draft, materials: 'x'.repeat(1000) });
    expect(insert.insert.mock.calls[0][0].materials).toHaveLength(1000);
  });
});
