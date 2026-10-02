import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  escapeHtml,
  fetchProducts,
  getProductImageUrl as prerenderImageUrl,
  injectShell,
  priceRange,
  renderProductPage,
  renderShell,
  renderSitemap,
  toProduct,
  toProductReference as prerenderReference,
  truncate,
} from './prerender.mjs';
import { getProductImageUrl } from '../src/utils/productImageUrl';
import { toProductReference } from '../src/utils/productLink';

const row = {
  id: 'AAAA1111-2222-3333-4444-555566667777',
  name: 'Ivory Rose Gajra',
  category: 'Hair Accessories',
  description: 'A row of hand-crocheted ivory roses that curves neatly around a bun.',
  price: 400,
  show_price: true,
  in_stock: true,
  image_url:
    'https://bblsjcjypdxntzlszliy.supabase.co/storage/v1/object/public/product-images/a/b.jpg',
  published_at: '2026-01-01T00:00:07+00:00',
  product_variants: [
    { id: 'v2', name: 'Blush', color: 'pink', price: 450, in_stock: true, sort_order: 2 },
    { id: 'v1', name: 'Ivory', color: 'white', price: null, in_stock: true, sort_order: 1 },
  ],
};

const product = toProduct(row);

afterEach(() => vi.unstubAllGlobals());

describe('fetchProducts', () => {
  it('fetches every published page, not just Supabase’s first 1,000 products', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => Array(1000).fill(row) })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ ...row, id: 'new-product' }] });
    vi.stubGlobal('fetch', fetchMock);

    const products = await fetchProducts('https://example.supabase.co', 'public-key');

    expect(products).toHaveLength(1001);
    expect(products.at(-1)?.id).toBe('new-product');
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('offset')).toBe('0');
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('offset')).toBe('1000');
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('published')).toBe('eq.true');
  });

  it('rejects a failed fetch rather than deploying a stale sitemap', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Unavailable' }));
    await expect(fetchProducts('https://example.supabase.co', 'public-key')).rejects.toThrow('503');
  });
});

describe('parity with the app helpers', () => {
  // The prerenderer runs in Node and cannot import the TypeScript utilities,
  // so these guard against the two copies drifting apart.
  it('builds the same product reference as the catalogue', () => {
    for (const name of ['Ivory Rose Gajra', 'Cute Bunny', 'Rakhi & Charms', '  ']) {
      const sample = { id: row.id, name };
      expect(prerenderReference(sample)).toBe(toProductReference(sample));
    }
  });

  it('builds the same transformed image URL as the catalogue', () => {
    expect(prerenderImageUrl(row.image_url, 960)).toBe(getProductImageUrl(row.image_url, 960));
  });

  it('builds the same R2 sized image URL as the catalogue', () => {
    for (const width of [96, 480, 960, 1600]) {
      const r2Image = 'https://images.luviacreations.com/products/admin/abc.webp';
      expect(prerenderImageUrl(r2Image, width)).toBe(getProductImageUrl(r2Image, width));
    }
  });

  it('rewrites legacy GitHub Pages images to absolute site URLs', () => {
    expect(
      prerenderImageUrl('https://singhalgoru.github.io/croche-catalogue/images/a.jpeg', 960),
    ).toBe('https://luviacreations.com/images/a.jpeg');
  });
});

describe('toProduct', () => {
  it('sorts variants and respects a hidden price', () => {
    expect(product.variants.map((variant) => variant.name)).toEqual(['Ivory', 'Blush']);
    expect(toProduct({ ...row, show_price: false }).price).toBeNull();
  });
});

describe('priceRange', () => {
  it('spans variant overrides and falls back to the product price', () => {
    expect(priceRange(product)).toEqual({ low: 400, high: 450 });
    expect(priceRange({ ...product, variants: [] })).toEqual({ low: 400, high: 400 });
    expect(priceRange({ ...product, price: null })).toBeNull();
  });
});

describe('escapeHtml and truncate', () => {
  it('escapes markup', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('keeps short text and trims long text on a word boundary', () => {
    expect(truncate('short text', 40)).toBe('short text');
    expect(truncate('the quick brown fox jumps over', 12)).toBe('the quick…');
  });
});

describe('renderShell', () => {
  const shell = renderShell([product]);

  it('puts the product name, price and description in the markup', () => {
    expect(shell).toContain('Ivory Rose Gajra');
    expect(shell).toContain('₹400');
    expect(shell).toContain('hand-crocheted ivory roses');
  });

  it('links to the static product page', () => {
    expect(shell).toContain(`href="/p/${prerenderReference(product)}/"`);
  });

  it('groups products under a category heading', () => {
    expect(shell).toContain('<h3>Handmade Crochet Hair Accessories</h3>');
  });

  it('omits images so the listing does not compete with the app for bandwidth', () => {
    expect(shell).not.toContain('<img');
  });
});

describe('injectShell', () => {
  const html = '<html><head></head><body><div id="root"><!--shell-->old<!--/shell--></div></body></html>';

  it('replaces the placeholder and adds the catalogue schema', () => {
    const result = injectShell(html, [product]);
    expect(result).not.toContain('>old<');
    expect(result).toContain('Ivory Rose Gajra');
    expect(result).toContain('"@type":"ItemList"');
    expect(result).toContain('"numberOfItems":1');
  });

  it('fails loudly when the markers are missing', () => {
    expect(() => injectShell('<html></html>', [product])).toThrow(/shell/);
  });
});

describe('renderProductPage', () => {
  const page = renderProductPage(product, '910000000000');

  it('points og:image at the JPEG share copy when one was written', () => {
    const withJpeg = renderProductPage(product, '91', {
      url: 'https://luviacreations.com/p/x/og.jpg',
      width: 800,
      height: 600,
    });
    expect(withJpeg).toContain('<meta property="og:image" content="https://luviacreations.com/p/x/og.jpg" />');
    expect(withJpeg).toContain('<meta property="og:image:type" content="image/jpeg" />');
    expect(withJpeg).toContain('<meta property="og:image:width" content="800" />');
    expect(withJpeg).toContain('<meta name="twitter:image" content="https://luviacreations.com/p/x/og.jpg" />');
    expect(page).not.toContain('og:image:type');
  });

  it('is a complete document with a self-referencing canonical', () => {
    expect(page).toContain('<!doctype html>');
    expect(page).toContain(
      `<link rel="canonical" href="https://luviacreations.com/p/${prerenderReference(product)}/" />`,
    );
  });

  it('carries the visible product facts', () => {
    expect(page).toContain('<h1>Ivory Rose Gajra</h1>');
    expect(page).toContain('₹400 – ₹450');
    expect(page).toContain('In stock');
    expect(page).toContain('hand-crocheted ivory roses');
    expect(page).toContain('<li>Ivory</li>');
  });

  it('describes the product with schema.org data that matches', () => {
    expect(page).toContain('"@type":"Product"');
    expect(page).toContain('"@type":"AggregateOffer"');
    expect(page).toContain('"lowPrice":"400"');
    expect(page).toContain('"highPrice":"450"');
    expect(page).toContain('"priceCurrency":"INR"');
    expect(page).toContain('https://schema.org/InStock');
    expect(page).toContain('"@type":"BreadcrumbList"');
  });

  it('never lets JSON-LD break out of its script element', () => {
    const escaped = renderProductPage(
      { ...product, description: '</script><script>alert(1)</script>' },
      '910000000000',
    );
    const scripts = escaped.match(/<script/g) ?? [];
    // One JSON-LD block plus the app redirect.
    expect(scripts).toHaveLength(2);
    expect(escaped).toContain('\\u003c/script');
  });

  it('sends visitors to the app product view but leaves crawlers on the page', () => {
    const reference = encodeURIComponent(prerenderReference(product));
    const source = page.match(/<script>([^<]*)<\/script>/)?.[1] ?? '';
    expect(source).toContain(`location.replace("/#product=${reference}")`);
    expect(source).toMatch(/bot\|crawl/);

    const hash = createHash('sha256').update(source).digest('base64');
    expect(page).toContain(`script-src 'sha256-${hash}'`);
  });

  it('offers a working order path and a route back to the app', () => {
    expect(page).toContain('https://wa.me/910000000000?text=');
    expect(page).toContain(`href="/#product=${encodeURIComponent(prerenderReference(product))}"`);
  });

  it('shows a single price when no variant overrides it', () => {
    expect(renderProductPage({ ...product, variants: [] }, '91')).toContain('₹400');
  });

  it('falls back gracefully when the price is hidden', () => {
    const hidden = renderProductPage({ ...product, price: null }, '91');
    expect(hidden).toContain('Price on request');
    expect(hidden).not.toContain('"offers"');
  });
});

describe('renderSitemap', () => {
  const xml = renderSitemap([product], '2026-09-30');

  it('lists the homepage and every product page', () => {
    expect(xml).toContain('<loc>https://luviacreations.com/</loc>');
    expect(xml).toContain(`<loc>https://luviacreations.com/p/${prerenderReference(product)}/</loc>`);
    expect(xml.match(/<url>/g)).toHaveLength(2);
  });

  it('reflects newly published products on the next build', () => {
    const nextProduct = { ...product, id: 'new-product-id', name: 'Crochet Bunny' };
    const updated = renderSitemap([product, nextProduct], '2026-10-01');

    expect(updated.match(/<url>/g)).toHaveLength(3);
    expect(updated).toContain(`<loc>https://luviacreations.com/p/${prerenderReference(nextProduct)}/</loc>`);
    expect(xml).not.toContain(prerenderReference(nextProduct));
  });

  it('removes unpublished products and retains the homepage if the catalogue is empty', () => {
    const empty = renderSitemap([], '2026-10-01');
    expect(empty.match(/<url>/g)).toHaveLength(1);
    expect(empty).not.toContain('/p/');
  });

  it('dates product entries from their publish date', () => {
    expect(xml).toContain('<lastmod>2026-01-01</lastmod>');
  });
});
