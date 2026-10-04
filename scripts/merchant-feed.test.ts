import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { toProduct } from './prerender.mjs';
import { cleanImageKey, merchantItems, renderMerchantFeed, writeMerchantCatalogue } from './merchant-feed.mjs';

const product = toProduct({
  id: 'p1', public_slug: 'rose-coaster', name: 'Rose & Coaster', category: 'Decor', description: 'Handmade <rose> & leaves.',
  price: 450, image_url: 'https://images.luviacreations.com/products/admin/photo-wm3.webp',
  product_variants: [
    { id: 'v1', public_slug: 'red', name: 'Red', price: 450, in_stock: true },
    { id: 'v2', public_slug: 'blue', name: 'Blue', price: 500, in_stock: false, image_url: 'https://images.luviacreations.com/products/admin/blue.webp' },
  ],
});

describe('Merchant Center feed', () => {
  it('maps migrated, static and new photos only to private clean WebP keys', () => {
    expect(cleanImageKey(product.image)).toBe('admin/photo/original.webp');
    expect(cleanImageKey('https://images.luviacreations.com/products/static/rose-wm3.webp')).toBe('static/rose/original.webp');
    expect(cleanImageKey('https://images.luviacreations.com/products/admin/new.webp')).toBe('admin/new/original.webp');
    expect(() => cleanImageKey('https://example.com/products/admin/new.webp')).toThrow('Unsupported');
    expect(() => cleanImageKey('https://images.luviacreations.com/products/admin/a/b.webp')).toThrow('Unsupported');
  });

  it('keeps variant price, availability, image and identity independent', () => {
    const items = merchantItems([product]);
    expect(items.map((item) => [item.merchantId, item.price, item.inStock])).toEqual([
      ['v1', 450, true], ['v2', 500, false],
    ]);
    expect(items[1].cleanKey).toBe('admin/blue/original.webp');
    expect(items[0].url).not.toBe(items[1].url);
    expect(items[0].variants).toEqual([]);
    expect(items[0].groupId).toBe('p1');
    expect(items[0].catalogueReference).toBe('rose-coaster');
    expect(items.map(item => item.url)).toEqual([
      'https://luviacreations.com/shopping/rose-coaster/red/',
      'https://luviacreations.com/shopping/rose-coaster/blue/',
    ]);
    expect(items.map(item => item.merchantId)).toEqual(['v1', 'v2']);
  });

  it('omits hidden prices explicitly and rejects invalid required data', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(merchantItems([{ ...product, price: null }])).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    for (const price of [0, -1, NaN, Infinity]) {
      expect(() => merchantItems([{ ...product, price, variants: [] }])).toThrow('Invalid Merchant price');
    }
    expect(() => merchantItems([{ ...product, description: ' ' }])).toThrow('Missing Merchant description');
  });

  it('does not label a single Standard variant as a colour or duplicate the title', () => {
    const items = merchantItems([{ ...product, variants: [{ ...product.variants[0], name: 'Standard' }] }]);
    expect(items[0].name).toBe(product.name);
    expect(renderMerchantFeed(items)).not.toContain('g:color');
    expect(renderMerchantFeed(items)).not.toContain('g:item_group_id');
  });

  it('uses an alternate gallery photo instead of a known text-overlay image', () => {
    const image = 'https://images.luviacreations.com/products/static/collages-evil-eye-charm-collage-wm3.webp';
    const variant = { ...product.variants[0], image, images: [product.image] };
    const items = merchantItems([{ ...product, variants: [variant] }]);
    expect(items[0].cleanKey).toBe('admin/photo/original.webp');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(merchantItems([{ ...product, variants: [{ ...variant, images: [] }] }])).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('added text'));
    warn.mockRestore();
  });

  it('writes valid escaped Google RSS with exact prices and no invented GTIN', () => {
    const items = merchantItems([product]).map((item) => ({
      ...item, image: 'https://luviacreations.com/merchant-images/clean.webp',
    }));
    const xml = renderMerchantFeed(items);
    const doc = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
    expect(doc.querySelectorAll('item')).toHaveLength(2);
    const field = (name: string) => doc.getElementsByTagNameNS('http://base.google.com/ns/1.0', name);
    expect(field('description')[0].textContent).toBe(product.description);
    expect(field('price')[1].textContent).toBe('500.00 INR');
    expect(field('availability')[1].textContent).toBe('out_of_stock');
    expect(field('identifier_exists')[0].textContent).toBe('no');
    expect(field('gtin')).toHaveLength(0);
    expect(field('image_link')[0].textContent).not.toContain('wm3');
    expect(field('id')[1].textContent).toBe('v2');
    expect(field('link')[1].textContent).toBe('https://luviacreations.com/shopping/rose-coaster/blue/');
    expect(xml).not.toContain('rose-coaster--p1');
  });

  it('publishes clean images once and matching static landing pages without redirects', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'luvia-merchant-test-'));
    try {
      const input = await sharp({ create: { width: 600, height: 500, channels: 3, background: '#ffffff' } }).webp().toBuffer();
      const items = merchantItems([{ ...product, variants: product.variants.map((variant) => ({ ...variant, image: product.image })) }]);
      const getImage = vi.fn().mockResolvedValue(input);
      await writeMerchantCatalogue(items, dir, getImage, '911234567890');
      expect(getImage).toHaveBeenCalledTimes(1);
      expect(await readdir(path.join(dir, 'merchant-images'))).toHaveLength(1);
      const page = await readFile(path.join(dir, 'shopping', 'rose-coaster', 'blue', 'index.html'), 'utf8');
      const doc = new JSDOM(page).window.document;
      expect(page).not.toContain('location.replace');
      expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(items[1].url);
      const graph = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!)['@graph'][0];
      expect(graph.offers.price).toBe('500');
      expect(graph.offers.availability).toContain('OutOfStock');
      expect(graph.image).toContain('/merchant-images/');
      expect(doc.querySelector('.hero')?.getAttribute('src')).toBe(graph.image);
      expect(doc.querySelector('.cta.alt')?.getAttribute('href')).toBe('/#product=rose-coaster');
      const oldPage = await readFile(path.join(dir, 'shopping', 'rose-coaster--p1', 'v2', 'index.html'), 'utf8');
      expect(new JSDOM(oldPage).window.document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(items[1].url);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails when clean originals are unavailable instead of using the watermarked photo', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'luvia-merchant-test-'));
    try {
      await expect(writeMerchantCatalogue(merchantItems([product]), dir,
        async () => { throw new Error('404 clean original'); }, '911234567890')).rejects.toThrow('404 clean original');
      await expect(readFile(path.join(dir, 'merchant-feed.xml'))).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects undersized or unprocessed photos rather than upscaling or publishing them', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'luvia-merchant-test-'));
    try {
      const small = await sharp({ create: { width: 500, height: 499, channels: 3, background: '#ffffff' } }).webp().toBuffer();
      const png = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#ffffff' } }).png().toBuffer();
      await expect(writeMerchantCatalogue(merchantItems([product]), dir,
        async () => small, '911234567890')).rejects.toThrow('500x500');
      await expect(writeMerchantCatalogue(merchantItems([product]), dir,
        async () => png, '911234567890')).rejects.toThrow('not processed WebP');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
