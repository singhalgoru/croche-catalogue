import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildContentPages, collectionPath, renderContentSitemap } from './content-pages.mjs';
import { toProduct } from './prerender.mjs';

const toy = toProduct({
  id: 'p1', public_slug: 'bunny', name: 'Bunny', category: 'Toys', description: 'Crochet bunny.',
  price: 500, image_url: 'https://images.luviacreations.com/products/admin/bunny.webp',
  published_at: '2026-10-01', product_variants: [],
});
const hair = toProduct({
  id: 'p2', public_slug: 'clip', name: 'Rose Clip', category: 'Hair Accessories', description: 'Crochet clip.',
  price: 100, show_price: false, product_variants: [],
});
const pages = buildContentPages([toy, hair], '919205907350');
const documentFor = (pathname: string) => new JSDOM(pages.get(pathname)).window.document;

describe('collection and information pages', () => {
  it('creates only populated collections and the three information pages', () => {
    expect([...pages.keys()]).toEqual(['/collections/toys/', '/collections/hair-accessories/', '/collections/', '/about/', '/faq/']);
    expect(collectionPath('../Toys / gifts')).toBe('/collections/toys-gifts/');
    expect(collectionPath('玩具')).toBe('/collections/%E7%8E%A9%E5%85%B7/');
    expect(() => buildContentPages([toy, { ...toy, category: 'toys' }], '919205907350')).toThrow('Duplicate collection path');
  });

  it('gives every page one H1, unique metadata, canonical and no client-app dependency', () => {
    const titles = new Set();
    for (const [pathname, html] of pages) {
      const doc = new JSDOM(html).window.document;
      expect(doc.querySelectorAll('h1')).toHaveLength(1);
      expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBeTruthy();
      expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`https://luviacreations.com${pathname}`);
      expect(doc.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(`https://luviacreations.com${pathname}`);
      titles.add(doc.title);
      expect(doc.querySelector('script[type="module"]')).toBeNull();
      expect(doc.querySelector('a[href="#main"]')).toBeTruthy();
    }
    expect(titles.size).toBe(pages.size);
  });

  it('includes only matching products and a matching ordered structured item list', () => {
    const doc = documentFor('/collections/toys/');
    expect(doc.querySelector('.grid')?.textContent).toContain('Bunny');
    expect(doc.querySelector('.grid')?.textContent).not.toContain('Rose Clip');
    expect(doc.querySelector('img[alt="Bunny"]')?.getAttribute('loading')).toBe('eager');
    expect(doc.querySelector('.product-card .product-photo img[aria-hidden="true"]')).toBeTruthy();
    expect(doc.querySelector('.product-copy h2 a')?.textContent).toBe('Bunny');
    expect(doc.querySelector('a[href="/p/bunny/"]')).toBeTruthy();
    expect(doc.querySelector('a[href="/?category=Toys"]')).toBeTruthy();
    const schema = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(schema['@type']).toBe('CollectionPage');
    expect(schema.mainEntity.itemListElement).toEqual([{ '@type': 'ListItem', position: 1, name: 'Bunny', url: 'https://luviacreations.com/p/bunny/' }]);
    expect(doc.body.textContent).toContain('catalogue snapshot');
    expect(documentFor('/collections/hair-accessories/').body.textContent).toContain('Price on request');
  });

  it('uses variant prices rather than an obsolete base price', () => {
    const adjusted = { ...toy, price: 100, variants: [{ price: 600 }, { price: 800 }] };
    const html = buildContentPages([adjusted], '919205907350').get('/collections/toys/');
    expect(new JSDOM(html).window.document.querySelector('.card')?.textContent).toContain('From ₹600');
  });

  it('escapes authored content and keeps script JSON safe', () => {
    const malicious = { ...toy, name: '</script><img src=x onerror=alert(1)>', category: '<script>Toys</script>' };
    const html = buildContentPages([malicious], '919205907350').get(collectionPath(malicious.category));
    const doc = new JSDOM(html).window.document;
    expect(doc.querySelector('img[onerror]')).toBeNull();
    expect(doc.querySelectorAll('script')).toHaveLength(1);
    expect(JSON.parse(doc.querySelector('script')!.textContent!).mainEntity.itemListElement[0].name).toBe(malicious.name);
  });

  it('includes factual contact links and accessible FAQs without invented rich-result claims', () => {
    const about = documentFor('/about/');
    expect(about.querySelector('a[href="mailto:orders@luviacreations.com"]')).toBeTruthy();
    expect(about.querySelector('a[href^="https://wa.me/919205907350"]')).toBeTruthy();
    const faq = documentFor('/faq/');
    expect(faq.querySelectorAll('details summary')).toHaveLength(8);
    expect(faq.body.textContent).toContain('does not confirm an order');
    expect(faq.body.textContent).toContain('before you pay');
    expect(faq.querySelector('a[href="/return-policy/"]')).toBeTruthy();
    expect(JSON.parse(faq.querySelector('script')!.textContent!)['@type']).toBe('WebPage');
  });

  it('adds all public content URLs to the sitemap without indexing query filters', () => {
    const xml = renderContentSitemap([toy, hair], '2026-10-06', pages);
    for (const pathname of pages.keys()) expect(xml).toContain(`<loc>https://luviacreations.com${pathname}</loc>`);
    expect(xml).not.toContain('?category=');
    expect(buildContentPages([], '919205907350').has('/collections/toys/')).toBe(false);
  });

  it('creates new admin categories including empty ones and removes deleted category pages on rebuild', () => {
    const next = buildContentPages([], '919205907350', [{ name: 'New Gifts', priority: 1 }]);
    expect(next.has('/collections/new-gifts/')).toBe(true);
    expect(next.has('/collections/toys/')).toBe(false);
    expect(new JSDOM(next.get('/collections/new-gifts/')).window.document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow');
    expect(renderContentSitemap([], '2026-10-06', next)).not.toContain('/collections/new-gifts/');
  });
});
