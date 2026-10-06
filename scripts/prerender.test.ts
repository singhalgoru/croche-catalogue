import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  escapeHtml,
  getProductMetaDescription as prerenderMetaDescription,
  attachProductApp,
  fetchProducts,
  getProductImageUrl as prerenderImageUrl,
  injectShell,
  injectCatalogueBootstrap,
  fetchBootstrapCategories,
  priceRange,
  renderProductPage,
  renderLlms,
  renderShell,
  renderSitemap,
  toProduct,
  toProductReference as prerenderReference,
  toProductSlug as prerenderSlug,
  truncate,
} from './prerender.mjs';
import { getProductImageUrl } from '../src/utils/productImageUrl';
import { toProductReference } from '../src/utils/productLink';
import { getProductMetaDescription } from '../src/utils/productMetaDescription';

const row = {
  id: 'AAAA1111-2222-3333-4444-555566667777',
  public_slug: 'ivory-rose-gajra',
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
    { id: 'v2', public_slug: 'blush', name: 'Blush', color: 'pink', price: 450, in_stock: true, sort_order: 2 },
    { id: 'v1', public_slug: 'ivory', name: 'Ivory', color: 'white', price: null, in_stock: true, sort_order: 1 },
  ],
};

const product = toProduct(row);

afterEach(() => vi.unstubAllGlobals());

describe('fetchProducts', () => {
  it('fetches category priorities for immediate initial filters', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => [{ name: 'Toys', sort_order: 10 }],
    }));
    expect(await fetchBootstrapCategories('https://example.supabase.co', 'public-key'))
      .toEqual([{ name: 'Toys', priority: 10 }]);
  });

  it('fails a build if the category snapshot cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Unavailable' }));
    await expect(fetchBootstrapCategories('https://example.supabase.co', 'public-key')).rejects.toThrow('503');
  });
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
    const selected = new URL(fetchMock.mock.calls[0][0]).searchParams.get('select')?.split(',');
    expect(selected).toEqual(expect.arrayContaining(['public_slug', 'seo_description', 'materials', 'dimensions', 'included_items', 'care_instructions', 'updated_at']));
  });

  it('rejects a failed fetch rather than deploying a stale sitemap', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Unavailable' }));
    await expect(fetchProducts('https://example.supabase.co', 'public-key')).rejects.toThrow('503');
  });
});

describe('parity with the app helpers', () => {
  it('embeds public snapshots safely and carries them to product pages for instant home navigation', () => {
    const homepage = { title: 'Catalogue', description: 'Summary.', canonical: 'https://luviacreations.com/' };
    const rows = [{ ...row, description: '</script><script>alert(1)</script>' }];
    const template = injectCatalogueBootstrap(
      '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'" /><script type="module" src="/app.js"></script><link rel="stylesheet" href="/app.css"></head></html>',
      rows, [{ name: 'Toys', priority: 10 }], homepage,
    );
    expect(template).not.toContain('</script><script>alert(1)');
    const json = template.match(/id="catalogue-bootstrap" type="application\/json">([\s\S]*?)<\/script>/)![1];
    expect(JSON.parse(json).products).toEqual(rows);
    expect(JSON.parse(json).homepage).toEqual(homepage);
    const page = attachProductApp(renderProductPage(product), template);
    expect(page).toContain(`id="catalogue-bootstrap" type="application/json">${json}</script>`);
  });
  it('loads and uses the admin SEO description across static metadata', () => {
    const sample = toProduct({ ...row, seo_description: ' Handmade ivory crochet roses for a bun. ' });
    expect(sample.seoDescription).toBe('Handmade ivory crochet roses for a bun.');
    expect(prerenderMetaDescription(sample)).toBe(getProductMetaDescription(sample));
    const html = renderProductPage(sample);
    for (const attribute of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
      expect(html).toContain(`${attribute} content="${sample.seoDescription}"`);
    }
    expect(sample.description).toBe(row.description);
  });
  it('links static breadcrumbs and their schema to the actual category filter', () => {
    const html = renderProductPage(product);
    const categoryUrl = `/?category=${encodeURIComponent(product.category)}`;
    expect(html).toContain(`href="${categoryUrl}"`);
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain(`<span aria-current="page">${product.name}</span>`);
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
    const breadcrumb = schema['@graph'].find((entry: { '@type': string }) => entry['@type'] === 'BreadcrumbList');
    expect(breadcrumb.itemListElement[1].item).toBe(`https://luviacreations.com${categoryUrl}`);
  });

  it('uses the same complete descriptions for search and social previews', () => {
    for (const description of ['', row.description, 'Incomplete text', `${'A long description '.repeat(20)}.`]) {
      const sample = { ...product, description };
      const summary = getProductMetaDescription(sample);
      expect(prerenderMetaDescription(sample)).toBe(summary);
      const html = renderProductPage(sample);
      for (const attribute of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
        expect(html).toContain(`${attribute} content="${escapeHtml(summary)}"`);
      }
    }
  });

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
  it('maps nullable optional details without changing old products', () => {
    expect(toProduct(row)).toMatchObject({
      materials: undefined, dimensions: undefined, includedItems: undefined, careInstructions: undefined,
    });
    expect(toProduct({
      ...row, materials: ' Cotton ', dimensions: null, included_items: '  ',
      care_instructions: ' Spot clean ',
    })).toMatchObject({
      materials: 'Cotton', dimensions: undefined, includedItems: undefined, careInstructions: 'Spot clean',
    });
  });
  it('sorts variants and respects a hidden price', () => {
    expect(product.variants.map((variant) => variant.name)).toEqual(['Ivory', 'Blush']);
    expect(toProduct({ ...row, show_price: false }).price).toBeNull();
  });

  it('derives product stock from its variants, like the app', () => {
    expect(toProduct({ ...row, in_stock: false }).inStock).toBe(true);
    expect(toProduct({
      ...row,
      product_variants: row.product_variants.map((variant) => ({ ...variant, in_stock: false })),
    }).inStock).toBe(false);
    expect(toProduct({ ...row, in_stock: false, product_variants: [] }).inStock).toBe(false);
  });

  it('trims product names before generating catalogue output', () => {
    expect(toProduct({ ...row, name: '  Ivory Rose Gajra  ' }).name).toBe('Ivory Rose Gajra');
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

  it('includes ordering and delivery guidance after the products for non-JavaScript visitors', () => {
    expect(shell).toContain('How ordering and delivery work');
    expect(shell).toContain('Adding items to your cart or sending a message does not confirm an order.');
    expect(shell).toContain('Your order is confirmed only after we confirm it with you.');
    expect(shell).toContain('Shipping charges and delivery timing depend on your location and order.');
    expect(shell).toContain('href="mailto:orders@luviacreations.com"');
    expect(shell).toContain('href="/return-policy/"');
    expect(shell.match(/href="\/return-policy\/"/g)).toHaveLength(1);
    expect(shell).toContain('<footer><a href="/return-policy/">');
    expect(shell.indexOf('ordering-guide-title')).toBeGreaterThan(shell.indexOf('Ivory Rose Gajra'));
  });

  it('puts the product name, price and description in the markup', () => {
    expect(shell).toContain('Ivory Rose Gajra');
    expect(shell).toContain('₹400');
    expect(shell).toContain('hand-crocheted ivory roses');
  });

  it('uses premium brand positioning in the non-JavaScript homepage introduction', () => {
    expect(shell).toContain('<h1>Premium Handmade Crochet Creations</h1>');
    expect(shell).toContain('Discover thoughtfully crafted crochet accessories, gifts, toys and decor by Luvia.');
  });

  it('links to the static product page', () => {
    expect(shell).toContain(`href="/p/${prerenderSlug(product)}/"`);
  });

  it('preloads the first catalogue product image in the initial HTML', () => {
    const escapedImage = prerenderImageUrl(product.image, 480).replace(/&/g, '&amp;');
    expect(shell).toContain(`<img src="${escapedImage}" width="480" height="480" loading="eager" fetchpriority="high"`);
    expect(shell.match(/<img\b/g)).toHaveLength(1);
  });

  it('renders the initially featured product first, matching the hydrated catalogue', () => {
    const second = { ...product, id: 'featured', name: 'Featured item', featured: true };
    const html = renderShell([product, second]);
    expect(html.indexOf('Featured item')).toBeLessThan(html.indexOf('Ivory Rose Gajra'));
    expect(html).toContain(`alt="Featured item"`);
  });

  it('groups products under a category heading', () => {
    expect(shell).toContain('<h3>Handmade Crochet Hair Accessories</h3>');
  });

  it('does not add image requests for every catalogue item', () => {
    expect(shell.match(/<img\b/g)).toHaveLength(1);
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

  it('updates all homepage descriptions from published categories', () => {
    const source = readFileSync(path.resolve('index.html'), 'utf8');
    const result = injectShell(source, [product, { ...product, category: 'Brooches' }]);
    for (const key of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
      const description = result.match(new RegExp(`${key}\\s+content="([^"]+)"`))?.[1];
      expect(description).toContain('hair accessories, brooches');
      expect(description).toContain('Luvia&#39;s premium handmade crochet');
      expect(description).not.toMatch(/bags|rakhi/i);
    }
    const scripts = [...result.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    const store = JSON.parse(scripts[0][1])['@graph'][0];
    expect(store.description).toContain('hair accessories, brooches');
  });

  it('bootstraps the premium homepage title for hydrated metadata', async () => {
    const source = readFileSync(path.resolve('index.html'), 'utf8');
    const result = injectCatalogueBootstrap(source, [], [], {
      title: 'Premium Handmade Crochet in India | Luvia Creations',
      description: 'Premium handmade crochet.',
      canonical: 'https://luviacreations.com/',
    });
    expect(result).toContain('"title":"Premium Handmade Crochet in India | Luvia Creations"');
  });
});

describe('renderLlms', () => {
  const template = readFileSync(path.resolve('public', 'llms.txt'), 'utf8');

  it('lists real product links under their categories with price ranges and stock', () => {
    const text = renderLlms(template, [product]);
    expect(text).toContain('## Hair Accessories');
    expect(text).toContain(`[Ivory Rose Gajra](https://luviacreations.com/p/${prerenderSlug(product)}/): ₹400 – ₹450. In stock.`);
    expect(text).toContain('[+91 92059 07350](https://wa.me/919205907350)');
    expect(text).toContain('WhatsApp enquiries via the catalogue');
    expect(text).not.toMatch(/\{\{WHATSAPP_|tel:/);
    expect(text).toContain('mailto:orders@luviacreations.com');
    expect(text).toContain('mailto:hello@luviacreations.com');
    expect(text).not.toMatch(/luviacreations\.com\/(?:products|collections|about|contact)\b/);
    expect(text).not.toMatch(/made to order|<!--catalogue-->|AI image generation/i);
  });

  it('uses the configured number in crawler contact details', () => {
    const text = renderLlms(template, [product], '+44 20 1234 5678');
    expect(text).toContain('[+442012345678](https://wa.me/442012345678)');
    const shell = injectShell(readFileSync(path.resolve('index.html'), 'utf8'), [product], '911234567890');
    expect(shell).toContain('"telephone": "+91 12345 67890"');
    expect(shell).not.toContain('{{WHATSAPP_PHONE}}');
  });

  it('does not expose hidden prices or retain removed products and categories', () => {
    const text = renderLlms(template, [{ ...product, price: null, inStock: false }]);
    expect(text).toContain('Price on request. Sold out.');
    expect(text).not.toContain('₹');
    expect(renderLlms(template, [])).not.toContain('Ivory Rose Gajra');
    expect(renderLlms(template, [])).not.toContain('## Hair Accessories');
  });

  it('escapes Markdown in names and rejects a template without catalogue markers', () => {
    expect(renderLlms(template, [{ ...product, name: 'Rose [Ivory]\nClip' }]))
      .toContain('Rose \\[Ivory\\] Clip');
    expect(() => renderLlms('missing markers', [])).toThrow(/markers/);
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
      `<link rel="canonical" href="https://luviacreations.com/p/${prerenderSlug(product)}/" />`,
    );
  });

  it('carries the visible product facts', () => {
    expect(page).toContain('<h1>Ivory Rose Gajra</h1>');
    expect(page).toContain('₹400 – ₹450');
    expect(page).toContain('In stock');
    expect(page).toContain('hand-crocheted ivory roses');
    expect(page).toContain('<li>Ivory</li>');
  });

  it('renders only supplied detail sections, with HTML escaping and unchanged routing', () => {
    const details = renderProductPage({
      ...product, materials: '<script>cotton</script>', dimensions: '10 cm & 4"',
      includedItems: '1 keychain', careInstructions: 'Spot clean\nDry flat',
    }, '91');
    expect(details).toContain('<h2>Materials</h2>');
    expect(details).toContain('&lt;script&gt;cotton&lt;/script&gt;');
    expect(details).toContain('10 cm &amp; 4&quot;');
    expect(details).toContain('<h2>What&#39;s included</h2>');
    expect(details).toContain('Spot clean\nDry flat');
    expect(details).toContain('white-space:pre-line');
    expect(details).not.toContain('<script>cotton');
    expect(details).toContain(`location.replace("/#product=${encodeURIComponent(prerenderSlug(product))}")`);
    expect(details).toContain(`<link rel="canonical" href="https://luviacreations.com/p/${prerenderSlug(product)}/"`);
  });

  it('omits all empty/missing detail headings for old or blank products', () => {
    for (const sample of [product, { ...product, materials: ' ', dimensions: '', includedItems: null, careInstructions: '\n' }]) {
      const html = renderProductPage(sample, '91');
      expect(html).not.toMatch(/<h2>(Materials|Dimensions|What&#39;s included|Care instructions)<\/h2>/);
    }
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

  it('has parseable Product JSON-LD in the raw page source', () => {
    const source = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    const data = JSON.parse(source!);
    const schema = data['@graph'].find((item: { '@type': string }) => item['@type'] === 'Product');
    expect(schema.name).toBe(product.name);
    expect(schema.url).toBe(`https://luviacreations.com/p/${prerenderSlug(product)}/`);
    expect(schema.offers.priceCurrency).toBe('INR');
    expect(schema.offers.lowPrice).toBe('400');
    expect(schema.offers.availability).toBe('https://schema.org/InStock');
  });

  it('keeps sold-out wording consistent with structured availability', () => {
    const soldOut = renderProductPage({ ...product, inStock: false }, '91');
    expect(soldOut).toContain('Sold out. Message us to confirm delivery timing.');
    expect(soldOut).toContain('https://schema.org/OutOfStock');
    expect(soldOut).not.toMatch(/made to order|ready to ship/i);
    expect(renderShell([{ ...product, inStock: false }])).toContain('Sold out.');
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
    const reference = encodeURIComponent(prerenderSlug(product));
    const source = page.match(/<script>([^<]*)<\/script>/)?.[1] ?? '';
    expect(source).toContain(`location.replace("/#product=${reference}")`);
    expect(source).toMatch(/bot\|crawl/);

    const hash = createHash('sha256').update(source).digest('base64');
    expect(page).toContain(`script-src 'sha256-${hash}'`);
  });

  it('offers a working order path and a route back to the app', () => {
    expect(page).toContain('https://wa.me/910000000000?text=');
    const orderHref = page.match(/href="(https:\/\/wa\.me\/910000000000\?text=[^"]+)"/)?.[1];
    expect(orderHref).toBeTruthy();
    expect(new URL(orderHref!.replace(/&#39;/g, "'").replace(/&amp;/g, '&')).searchParams.get('text')).toBe(
      `Hi Luvia, I'm interested in ${product.name}.\n\nhttps://luviacreations.com/p/${prerenderSlug(product)}/`,
    );
    expect(page).toContain(`href="/#product=${encodeURIComponent(prerenderSlug(product))}"`);
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

describe('interactive product page generation', () => {
  const template = `<head><meta http-equiv="Content-Security-Policy" content="script-src 'self'; connect-src https://*.supabase.co" />
    <script type="module" crossorigin src="/assets/app.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/app.css">
    <link rel="manifest" href="/manifest.webmanifest"></head><body></body>`;

  it('boots the app on the product URL without redirecting humans or bots', () => {
    const page = attachProductApp(renderProductPage(product, '91', null, false), template);
    expect(page).toContain('<div id="root">');
    expect(page).toContain('src="/assets/app.js"');
    expect(page).toContain('href="/assets/app.css"');
    expect(page).toContain('href="/manifest.webmanifest"');
    expect(page).toContain('connect-src https://*.supabase.co');
    expect(page).toContain('id="product-fallback-style"');
    expect(page).not.toContain('location.replace');
    expect(page).toContain('<h1>Ivory Rose Gajra</h1>');
    expect(page).toContain('"@type":"Product"');
    expect(page).toContain(`rel="canonical" href="https://luviacreations.com/p/${prerenderSlug(product)}/"`);
  });

  it('fails explicitly if build assets are missing', () => {
    expect(() => attachProductApp('page', '<head></head>')).toThrow('missing the product app assets');
  });

  it('keeps merchant landing pages static', () => {
    const page = renderProductPage(product, '91', null, false);
    expect(page).not.toContain('type="module"');
    expect(page).not.toContain('location.replace');
  });
});

describe('renderSitemap', () => {
  const xml = renderSitemap([product], '2026-09-30');

  it('lists the homepage, return policy and every product page', () => {
    expect(xml).toContain('<loc>https://luviacreations.com/</loc>');
    expect(xml).toContain(`<loc>https://luviacreations.com/p/${prerenderSlug(product)}/</loc>`);
    expect(xml).toContain('<loc>https://luviacreations.com/return-policy/</loc>');
    expect(xml.match(/<url>/g)).toHaveLength(3);
  });

  it('reflects newly published products on the next build', () => {
    const nextProduct = { ...product, id: 'new-product-id', name: 'Crochet Bunny' };
    const updated = renderSitemap([product, nextProduct], '2026-10-01');

    expect(updated.match(/<url>/g)).toHaveLength(4);
    expect(updated).toContain(`<loc>https://luviacreations.com/p/${prerenderSlug(nextProduct)}/</loc>`);
    expect(xml).not.toContain(prerenderReference(nextProduct));
  });

  it('removes unpublished products and retains permanent pages if the catalogue is empty', () => {
    const empty = renderSitemap([], '2026-10-01');
    expect(empty.match(/<url>/g)).toHaveLength(2);
    expect(empty).not.toContain('/p/');
  });

  it('dates product entries from their publish date', () => {
    expect(xml).toContain('<lastmod>2026-01-01</lastmod>');
  });

  it('uses the stored modification date and stays unchanged across rebuilds', () => {
    const edited = toProduct({ ...row, updated_at: '2026-10-03T12:00:00Z' });
    expect(edited.updatedAt).toBe('2026-10-03T12:00:00Z');
    for (const buildDate of ['2026-10-04', '2026-10-05']) {
      const sitemap = renderSitemap([edited], buildDate);
      const entry = sitemap.split('<url>')[3];
      expect(entry).toContain('<lastmod>2026-10-03</lastmod>');
      expect(entry).not.toContain(`<lastmod>${buildDate}</lastmod>`);
      expect(entry).not.toContain('<lastmod>2026-01-01</lastmod>');
    }
  });

  it('normalises timestamps to UTC and falls back to publication only if needed', () => {
    expect(renderSitemap([{ ...product, updatedAt: '2026-10-03T01:00:00+05:30' }], '2026-10-05'))
      .toContain('<lastmod>2026-10-02</lastmod>');
    expect(renderSitemap([{ ...product, updatedAt: 'invalid' }], '2026-10-05'))
      .toContain('<lastmod>2026-01-01</lastmod>');
  });

  it('omits unknown product dates with a warning instead of inventing a build-date modification', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const sitemap = renderSitemap([{ ...product, updatedAt: null, publishedAt: null }], '2026-10-05');
      expect(sitemap.split('<url>')[3]).not.toContain('<lastmod>');
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('no valid modification or publication date'));
    } finally {
      warning.mockRestore();
    }
  });

  it('omits unused priority and changefreq fields', () => {
    expect(xml).not.toMatch(/priority|changefreq/);
  });
});

describe('legacy clean-link compatibility', () => {
  it('keeps old product and Merchant URLs routable outside the sitemap', () => {
    const notFound = readFileSync(path.resolve('public', '404.html'), 'utf8');
    expect(notFound).toContain('/^\\/p\\/([^/]+)\\/?$/');
    expect(notFound).toContain('/^\\/shopping\\/([^/]+)\\/([^/]+)\\/?$/');
    expect(notFound).toContain("params.set('variant', decode(merchant[2]))");
    expect(renderSitemap([product], '2026-10-01')).not.toContain(prerenderReference(product));
  });
});
