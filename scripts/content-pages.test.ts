import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildContentPages, collectionPath, renderContentSitemap } from './content-pages.mjs';
import { toProduct } from './prerender.mjs';
import storeContent from '../src/content/storeContent.json';

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
  it('publishes regular category covers, product hotspots and category-specific social preview images', () => {
    const cover = 'https://images.luviacreations.com/products/admin/look.webp';
    const categories = [{ name: 'Toys', priority: 1, coverImage: cover, imageHotspots: [
      { productId: 'p1', x: 20, y: 75 }, { productId: 'removed', x: 30, y: 30 },
    ] }];
    const result = buildContentPages([toy], '919205907350', categories);
    const doc = new JSDOM(result.get('/collections/toys/')).window.document;
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(cover);
    expect(doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')).toBe(cover);
    expect(doc.querySelectorAll('section[aria-label="Shop the look: Toys"] a')).toHaveLength(2);
    expect(doc.querySelector('section[aria-label="Shop the look: Toys"] a')?.getAttribute('style')).toContain('left:20%;top:75%');
    expect(doc.querySelector('section[aria-label="Shop the look: Toys"] a')?.textContent).toBe('');
    expect(doc.querySelector('ol[aria-label="Products in this look"]')?.className).toBe('hotspot-links');
    expect(result.get('/collections/')).toContain('look-w480.webp');
    const fallback = new JSDOM(buildContentPages([toy], '919205907350').get('/collections/toys/')).window.document;
    expect(fallback.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(toy.image);
  });
  it('publishes a bulk gifting page with branded email, WhatsApp and sitemap discovery', () => {
    const doc = documentFor('/bulk-orders/');
    expect(doc.querySelector('h1')?.textContent).toBe('Bulk Orders & Corporate Gifting');
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://luviacreations.com/bulk-orders/');
    const email = new URL(doc.querySelector<HTMLAnchorElement>('main a[href^="mailto:"]')!.href);
    expect(email.pathname).toBe('bulkorder@luviacreations.com');
    expect(email.searchParams.get('subject')).toBe('Luvia Creations | Bulk Orders & Corporate Gifting Enquiry');
    expect(doc.querySelector('main a[href^="https://wa.me/919205907350"]')).toBeTruthy();
    expect(renderContentSitemap([toy], '2026-10-14', pages)).toContain('https://luviacreations.com/bulk-orders/');
  });
  it.each([
    ['/terms-and-conditions/', 'Terms & Conditions', 'Prices and payment'],
    ['/privacy-policy/', 'Privacy Policy', 'Your choices and requests'],
  ])('publishes crawlable policy content and sitemap entry at %s', (path, title, heading) => {
    const doc = documentFor(path);
    expect(doc.querySelector('h1')?.textContent).toBe(title);
    expect(doc.querySelector('main')?.textContent).toContain(heading);
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`https://luviacreations.com${path}`);
    expect(doc.querySelector(`footer a[href="${path}"]`)).not.toBeNull();
    expect(renderContentSitemap([toy], '2026-10-14', pages)).toContain(`https://luviacreations.com${path}`);
  });
  it('renders custom seasonal covers on static cards only with product fallback after removal', () => {
    const category = { name: 'Festive', priority: 1, isSeasonal: true, productIds: ['p1'], coverImage: 'https://images.luviacreations.com/products/admin/season.webp' };
    const result = buildContentPages([toy], '919205907350', [category]);
    expect(result.get('/collections/')).toContain('season-w480.webp');
    const doc = new JSDOM(result.get('/collections/festive/')).window.document;
    expect(doc.querySelector('img[alt="Festive collection"]')).toBeNull();
    expect(doc.querySelector('img[src*="season"]')).toBeNull();
    expect(doc.body.textContent).toContain('Bunny');
    const removed = buildContentPages([toy], '919205907350', [{ ...category, coverImage: '' }]);
    expect(removed.get('/collections/')).not.toContain('season-w480.webp');
    expect(removed.get('/collections/')).toContain('bunny-w480.webp');
    expect(removed.get('/collections/festive/')).not.toContain('alt="Festive collection"');
  });
  it('includes the AI imagery disclosure in the crawlable FAQ', () => {
    const doc = documentFor('/faq/');
    const disclosure = [...doc.querySelectorAll('details')].find(detail =>
      detail.querySelector('summary')?.textContent === 'Are your product images generated using AI?');
    expect(disclosure?.textContent).toContain('photographs of our actual handmade products');
    expect(disclosure?.textContent).toContain('may not reproduce every stitch, colour or proportion exactly');
    expect(disclosure?.textContent).toContain('actual product photograph');
  });
  it('omits the redundant homepage shopping button on static collections', () => {
    const result = buildContentPages([toy], '919205907350');
    expect(result.get('/collections/toys/')).not.toContain('with the cart');
    expect(result.get('/collections/toys/')).toContain('Choose options &amp; add to cart');
  });
  it('caps stored long overviews at 90 words in static pages too', () => {
    const result = buildContentPages([toy], '919205907350', [{ name: 'Toys', priority: 10, overview: Array(200).fill('crochet').join(' ') }]);
    const doc = new JSDOM(result.get('/collections/toys/')).window.document;
    expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')?.split(/\s+/)).toHaveLength(90);
  });
  it('shows seasonal products in both collections and omits hidden seasonal pages and links', () => {
    const categories = [{ name: 'Navaratri', priority: 999, isSeasonal: true, visible: true, productIds: ['p1', 'p2'], overview: 'Reviewed overview & handmade gifts.' }];
    const seasonal = buildContentPages([toy, hair], '919205907350', categories);
    const doc = new JSDOM(seasonal.get('/collections/navaratri/')).window.document;
    expect(doc.querySelector('.grid')?.textContent).toContain('Bunny');
    expect(doc.querySelector('.grid')?.textContent).toContain('Rose Clip');
    expect(doc.body.textContent).toContain('Reviewed overview & handmade gifts.');
    expect([...seasonal.keys()][0]).toBe('/collections/navaratri/');
    expect(seasonal.get('/collections/toys/')).toContain('Bunny');
    expect(seasonal.get('/collections/hair-accessories/')).toContain('Rose Clip');
    const hidden = buildContentPages([toy, hair], '919205907350', [{ ...categories[0], visible: false }]);
    expect(hidden.has('/collections/navaratri/')).toBe(false);
    expect(hidden.get('/collections/')).not.toContain('Navaratri');
    expect(hidden.get('/collections/toys/')).toContain('Bunny');
  });
  it('discloses the actual catalogue payment model and additional shipping in crawlable pages', () => {
    for (const pathname of ['/about/', '/faq/']) {
      const text = documentFor(pathname).body.textContent;
      expect(text).toContain('does not take payment or confirm an order');
      expect(text).toContain('Prices are in Indian rupees');
      expect(text).not.toContain('include GST');
      expect(text).toContain('Shipping charges, if applicable, are shown before payment.');
      expect(text).toContain('Never share your card PIN, OTP or passwords');
      expect(text).not.toContain('Admin Razorpay');
      expect(text).not.toContain('sandbox demonstration');
      expect(text).not.toContain('when online checkout is available');
    }
  });
  it('creates populated collections, information pages and dedicated policies', () => {
    expect([...pages.keys()]).toEqual(['/collections/toys/', '/collections/hair-accessories/', '/collections/', '/about/', '/faq/', '/terms-and-conditions/', '/privacy-policy/', '/bulk-orders/']);
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
    expect(doc.querySelector('a[href="/?category=Toys"]')).toBeNull();
    expect(doc.querySelector('.product-copy a.button[href="/p/bunny/"]')?.textContent).toContain('add to cart');
    expect(doc.querySelector('.product-copy a[aria-label="Share Bunny"]')?.getAttribute('href')).toContain(encodeURIComponent('https://luviacreations.com/p/bunny/'));
    const schema = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(schema['@type']).toBe('CollectionPage');
    expect(schema.mainEntity.itemListElement).toEqual([{ '@type': 'ListItem', position: 1, name: 'Bunny', url: 'https://luviacreations.com/p/bunny/' }]);
    expect(doc.body.textContent).toContain('catalogue snapshot');
    expect(documentFor('/collections/hair-accessories/').body.textContent).toContain('Price on request');
  });

  it('renders a photo-led collections hub without long descriptions or duplicate links', () => {
    const doc = documentFor('/collections/');
    const nav = doc.querySelector('nav[aria-label="Explore collections"]');
    expect(nav?.querySelectorAll('.collection-tile')).toHaveLength(2);
    expect(nav?.querySelector('a[href="/collections/toys/"] img')?.getAttribute('src')).toContain('bunny-w480.webp');
    expect(nav?.querySelector('a[href="/collections/toys/"]')?.textContent).toContain('1 product');
    expect(nav?.textContent).not.toContain('Meet the handmade crochet toys');
    expect(doc.querySelector('a.button[href="/"]')?.textContent).toBe('Shop all products');
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
    expect(about.body.textContent).toContain('Gurugram, Haryana, India');
    expect(about.querySelector('a[href="mailto:orders@luviacreations.com"]')).toBeTruthy();
    expect(about.querySelector('a[href^="https://wa.me/919205907350"]')).toBeTruthy();
    const faq = documentFor('/faq/');
    expect(faq.querySelectorAll('details summary')).toHaveLength(storeContent.questions.length + 1);
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
    expect(new JSDOM(next.get('/collections/')).window.document.querySelector('a[href="/collections/new-gifts/"]')).toBeNull();
    const published = buildContentPages([{ ...toy, category: 'New Gifts' }], '919205907350', [{ name: 'New Gifts', priority: 1 }]);
    expect(new JSDOM(published.get('/collections/')).window.document.querySelector('a[href="/collections/new-gifts/"]')).toBeTruthy();
  });
});
