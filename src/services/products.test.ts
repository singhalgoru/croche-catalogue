import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchManagedProducts, fetchPublishedProducts, publishProduct, updateProduct,
  bulkUpdateProductDescriptions,
  readCatalogueBootstrap,
  type NewProduct, type ProductUpdate,
} from './products';
import { PRODUCT_COLUMNS } from './productColumns';

const { from, rpc, getUser, upload, archive, convert } = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), getUser: vi.fn(), upload: vi.fn(), archive: vi.fn(), convert: vi.fn(),
}));
vi.mock('../lib/supabaseConfig', () => ({
  loadSupabase: async () => ({ from, rpc, auth: { getUser } }),
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
    insert: vi.fn(), update: vi.fn(), upsert: vi.fn(), delete: vi.fn(), single: vi.fn(),
    then: (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve),
  };
  for (const method of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'upsert', 'delete'] as const) {
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

describe('atomic bulk descriptions', () => {
  const change = {
    id: 'p1', description: 'Reviewed bunny copy.', seoDescription: 'Reviewed bunny summary.',
    originalDescription: 'Old bunny.', originalSeoDescription: '',
  };
  it('uses one RPC and changes no other product fields', async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    const changes = [change, { ...change, id: 'p2' }];
    expect(await bulkUpdateProductDescriptions(changes)).toBe(2);
    expect(rpc).toHaveBeenCalledWith('bulk_update_product_descriptions', { changes });
    expect(from).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
  it('rejects invalid batch sizes, duplicates and invalid copy before calling the database', async () => {
    for (const changes of [[], [change, change], Array.from({ length: 101 }, (_, id) => ({ ...change, id: String(id) })),
      [{ ...change, description: ' ' }], [{ ...change, description: 'a'.repeat(2001) }],
      [{ ...change, seoDescription: 'a'.repeat(161) }]]) {
      await expect(bulkUpdateProductDescriptions(changes)).rejects.toThrow();
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it('surfaces conflicts and unexpected save counts', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Products changed. No changes saved.' } });
    await expect(bulkUpdateProductDescriptions([change])).rejects.toThrow('Products changed');
    rpc.mockResolvedValueOnce({ data: 0, error: null });
    await expect(bulkUpdateProductDescriptions([change])).rejects.toThrow('unexpected bulk-save count');
  });
});

describe('product detail loading', () => {
  it('reads the public HTML snapshot without consuming live prefetch data', () => {
    const script = document.createElement('script');
    script.id = 'catalogue-bootstrap';
    script.type = 'application/json';
    script.textContent = JSON.stringify({
      products: [row], categories: [{ name: row.category, priority: 10 }],
      homepage: { title: 'Catalogue', description: 'Catalogue summary.', canonical: 'https://luviacreations.com/' },
    });
    document.head.append(script);
    try {
      expect(readCatalogueBootstrap()?.products[0]).toMatchObject({ id: row.id, image: row.image_url });
      expect(readCatalogueBootstrap()?.categories).toEqual([{ name: row.category, priority: 10 }]);
      expect(from).not.toHaveBeenCalled();
    } finally { script.remove(); }
  });

  it('logs malformed snapshots and falls back to live loading', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const script = document.createElement('script');
    script.id = 'catalogue-bootstrap';
    script.type = 'application/json';
    script.textContent = '{broken';
    document.head.append(script);
    try {
      expect(readCatalogueBootstrap()).toBeNull();
      expect(log).toHaveBeenCalled();
    } finally { script.remove(); log.mockRestore(); }
  });
  it('selects and maps all four details for public and admin products', async () => {
    const detailedRow = {
      ...row, materials: ' Cotton ', dimensions: ' 10 cm ', included_items: ' 1 keychain ',
      seo_description: ' Handmade lavender crochet bunny. ',
      care_instructions: ' Spot clean ',
    };
    const published = queueQuery([{ ...detailedRow, product_profit_margins: [] }]);
    const managed = queueQuery([{
      ...detailedRow,
      product_profit_margins: { profit_margin_percent: 46.2, gst_percent: 5 },
    }]);
    const loadedProducts = [await fetchPublishedProducts(), await fetchManagedProducts()];
    expect(loadedProducts[0][0]).toMatchObject({
      materials: 'Cotton', dimensions: '10 cm', includedItems: '1 keychain', careInstructions: 'Spot clean',
      price: 300, profitMarginPercent: null, gstPercent: null, inStock: true,
      seoDescription: 'Handmade lavender crochet bunny.',
    });
    expect(loadedProducts[1][0]).toMatchObject({
      materials: 'Cotton', dimensions: '10 cm', includedItems: '1 keychain', careInstructions: 'Spot clean',
      price: 300, profitMarginPercent: 46.2, gstPercent: 5, inStock: true,
      seoDescription: 'Handmade lavender crochet bunny.',
    });
    expect(published.select).toHaveBeenCalledWith(PRODUCT_COLUMNS);
    expect(managed.select).toHaveBeenCalledWith(PRODUCT_COLUMNS);
    expect(PRODUCT_COLUMNS).toContain('included_items, care_instructions');
    expect(PRODUCT_COLUMNS).toContain('product_profit_margins(profit_margin_percent, gst_percent)');
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
  it('saves and reloads SEO summaries at the exact 160-character limit', async () => {
    const seoDescription = `${'a'.repeat(159)}.`;
    queueQuery([row]);
    const [product] = await fetchManagedProducts();
    const write = queueQuery(null);
    queueQuery({ ...row, seo_description: seoDescription });
    const saved = await updateProduct(product, { ...update, seoDescription });
    expect(write.update.mock.calls[0][0].seo_description).toBe(seoDescription);
    expect(saved.seoDescription).toBe(seoDescription);
    await expect(updateProduct(product, { ...update, seoDescription: `${seoDescription}x` }))
      .rejects.toThrow('SEO description');
  });
  it('stores trimmed snake-case details during upload and returns them on reload', async () => {
    queueQuery([]);
    const insert = queueQuery({ id: row.id });
    queueQuery({ id: 'variant-1' });
    queueQuery({ ...row, materials: 'Cotton', dimensions: '10 cm', included_items: '1 keychain', care_instructions: 'Spot clean' });
    const product = await publishProduct({
      ...draft, materials: ' Cotton ', dimensions: ' 10 cm ', includedItems: ' 1 keychain ', careInstructions: ' Spot clean ',
      seoDescription: ' Handmade lavender crochet bunny. ',
    });
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({
      materials: 'Cotton', dimensions: '10 cm', included_items: '1 keychain', care_instructions: 'Spot clean',
      price: 300, in_stock: true,
      seo_description: 'Handmade lavender crochet bunny.',
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
      seoDescription: '',
    });

    const payload = write.update.mock.calls[0][0];
    expect(payload).toMatchObject({ materials: null, included_items: '1 keychain', care_instructions: 'Spot clean', price: 300 });
    expect(payload).not.toHaveProperty('dimensions');
    expect(payload.seo_description).toBeNull();
    expect(payload).not.toHaveProperty('in_stock');
    expect(payload).not.toHaveProperty('available_quantity');
    expect(edited.materials).toBeUndefined();
    expect(edited.dimensions).toBe('10 cm');
  });

  it('persists the calculated product margin without affecting other product fields', async () => {
    queueQuery([row]);
    const [product] = await fetchManagedProducts();
    const write = queueQuery(null);
    const marginWrite = queueQuery(null);
    queueQuery({
      ...row,
      product_profit_margins: { profit_margin_percent: 45.125, gst_percent: 5 },
    });

    const saved = await updateProduct(product, {
      ...update,
      profitMarginPercent: 45.125,
      gstPercent: 5,
    });

    expect(write.update.mock.calls[0][0]).not.toHaveProperty('profit_margin_percent');
    expect(marginWrite.upsert.mock.calls[0][0]).toMatchObject({ profit_margin_percent: 45.125 });
    expect(marginWrite.upsert.mock.calls[0][0]).toMatchObject({ gst_percent: 5 });
    expect(saved.profitMarginPercent).toBe(45.125);
    expect(saved.gstPercent).toBe(5);
  });

  it('rejects invalid calculated margins before writing', async () => {
    queueQuery([row]);
    const [product] = await fetchManagedProducts();
    for (const profitMarginPercent of [Number.NaN, Number.POSITIVE_INFINITY, 100.01]) {
      await expect(updateProduct(product, { ...update, profitMarginPercent }))
        .rejects.toThrow('finite percentage no greater than 100');
    }
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('keeps legacy upload payloads valid and does not invent new details', async () => {
    queueQuery([]);
    const insert = queueQuery({ id: row.id });
    queueQuery({ id: 'variant-1' });
    queueQuery(row);
    await publishProduct(draft);
    expect(insert.insert.mock.calls[0][0]).not.toHaveProperty('materials');
    expect(insert.insert.mock.calls[0][0]).not.toHaveProperty('seo_description');
  });

  it('rejects overlong details before uploads and propagates database errors', async () => {
    await expect(publishProduct({ ...draft, seoDescription: 'x'.repeat(161) })).rejects.toThrow('SEO description');
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
