import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  it('keeps the initial Collections page compact with bottom navigation before the app loads', () => {
    const doc = documentFor('/collections/');
    const logo = doc.querySelector('header .brand');
    expect(logo?.textContent).toBe('Luvia Creations');
    expect(logo?.querySelector('img')?.getAttribute('width')).toBe('48');
    const navigation = doc.querySelector('nav[aria-label="Mobile navigation"]');
    expect(navigation?.querySelector('[aria-current="page"]')?.textContent).toBe('Collections');
    expect(navigation?.querySelector('a[href="/?checkout=cart"]')).toBeTruthy();
    expect(doc.querySelector('style')?.textContent).toContain('position:fixed');
    expect(doc.querySelector('style')?.textContent).toContain('header>nav{display:none}');
  });
  it('prerenders the full founder story with matching social metadata, contact details and sitemap discovery', () => {
    const doc = documentFor('/about/');
    const story = doc.querySelector('article');
    expect(story?.querySelector('img')?.getAttribute('src')).toBe(storeContent.brandStory.portrait.src);
    expect(story?.querySelector('img')?.getAttribute('alt')).toBe(storeContent.brandStory.portrait.alt);
    expect(doc.querySelector('h1')?.textContent).toBe(storeContent.brandStory.title);
    expect(story?.textContent).toContain(storeContent.brandStory.intro);
    expect(story?.textContent).toContain(storeContent.brandStory.founderNote.title);
    expect(story?.textContent).toContain(storeContent.brandStory.founderNote.text);
    expect(story?.textContent).toContain(storeContent.brandStory.founderNote.role);
    for (const section of storeContent.brandStory.sections) {
      expect([...story!.querySelectorAll('h2')].map(heading => heading.textContent)).toContain(section.title);
      for (const paragraph of section.paragraphs) expect(story?.textContent).toContain(paragraph);
    }
    expect(story?.querySelector('a')?.getAttribute('href')).toBe('/collections/');
    for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
      expect(doc.querySelector(selector)?.getAttribute('content')).toBe(storeContent.brandStory.description);
    }
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://luviacreations.com/about/');
    expect(doc.querySelector('a[href="mailto:hello@luviacreations.com"]')).toBeTruthy();
    expect(doc.body.textContent).toContain(storeContent.dispatch);
    expect(renderContentSitemap([toy], '2026-10-25', pages)).toContain('https://luviacreations.com/about/');
    const llms = readFileSync(resolve('public', 'llms.txt'), 'utf8');
    expect(llms).toContain('https://luviacreations.com/about/');
    expect(llms).toContain('Tanushree Mithal');
  });
  it('provides matching social previews on the standalone return policy without changing indexing', () => {
    const doc = new JSDOM(readFileSync(resolve('public', 'return-policy', 'index.html'), 'utf8')).window.document;
    const content = (selector: string) => doc.querySelector(selector)?.getAttribute('content');
    expect(content('meta[property="og:type"]')).toBe('website');
    expect(content('meta[property="og:title"]')).toBe(doc.title);
    expect(content('meta[property="og:description"]')).toBe(content('meta[name="description"]'));
    expect(content('meta[property="og:url"]')).toBe(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'));
    expect(content('meta[property="og:image"]')).toBe('https://luviacreations.com/images/luvia-logo.jpg');
    expect(content('meta[name="twitter:card"]')).toBe('summary_large_image');
    for (const field of ['title', 'description', 'image']) {
      expect(doc.querySelectorAll(`meta[name="twitter:${field}"]`)).toHaveLength(1);
      expect(content(`meta[name="twitter:${field}"]`)).toBe(content(`meta[property="og:${field}"]`));
    }
    expect(content('meta[name="robots"]')).toBe('index, follow');
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
  });
  it('marks video products above the photo watermark in prerendered cards only', () => {
    const withVideo = { ...toy, makingVideo: { title: 'Making Bunny' } };
    const doc = new JSDOM(buildContentPages([withVideo, hair], '919205907350').get('/collections/toys/')).window.document;
    const badge = doc.querySelector('[aria-label="Watch making video for Bunny"]');
    expect(badge?.getAttribute('style')).toContain('top:8px;right:8px');
    expect(badge?.getAttribute('href')).toBe('/p/bunny/?watch=making-video#making-video');
    expect(badge?.parentElement?.closest('a')).toBeNull();
    expect(documentFor('/collections/hair-accessories/').querySelector('[title="Watch making video"]')).toBeNull();
  });
  it('publishes curated pages with ranked product links, shared chrome, metadata, schema and sitemap entries', () => {
    const available = toProduct({
      id: 'p1', public_slug: 'bunny', name: 'Bunny', category: 'Toys', description: 'Crochet bunny.',
      featured: true, price: 500, product_variants: [{ id: 'v1', in_stock: true, available_quantity: 2 }],
    });
    const second = { ...available, id: 'second', publicSlug: 'second', name: 'Second', sortOrder: 2 };
    const sold = { ...available, id: 'sold', publicSlug: 'sold', variants: [{ inStock: true, availableQuantity: 0 }] };
    const result = buildContentPages([available, second, sold, hair], '919205907350', [], ['second', 'p1', 'missing', 'sold']);
    for (const [pathname, title, slugs] of [
      ['/bestsellers/', 'Bestsellers', ['second', 'bunny']],
      ['/featured/', 'Featured products', ['bunny', 'second']],
    ] as const) {
      const doc = new JSDOM(result.get(pathname)).window.document;
      expect(doc.querySelector('h1')?.textContent).toBe(title);
      expect(doc.querySelector('header .brand')?.textContent).toBe('Luvia Creations');
      expect(doc.querySelector(`footer a[href="${pathname}"]`)).not.toBeNull();
      expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`https://luviacreations.com${pathname}`);
      expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBeTruthy();
      expect([...doc.querySelectorAll('main h2 a')].map(link => link.getAttribute('href'))).toEqual(slugs.map(slug => `/p/${slug}/`));
      const schema = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!);
      expect(schema['@type']).toBe('CollectionPage');
      expect(schema.mainEntity.numberOfItems).toBe(2);
      expect(schema.mainEntity.itemListElement.map((item: { url: string }) => item.url))
        .toEqual(slugs.map(slug => `https://luviacreations.com/p/${slug}/`));
      expect(schema.breadcrumb.itemListElement.map((item: { name: string }) => item.name)).toEqual(['Home', title]);
      expect(renderContentSitemap([available], '2026-10-24', result)).toContain(`https://luviacreations.com${pathname}`);
    }
  });
  it('keeps curated pages discoverable and honest when no products qualify', () => {
    for (const pathname of ['/bestsellers/', '/featured/']) {
      const doc = documentFor(pathname);
      expect(doc.querySelector('main ul.grid')).toBeNull();
      expect(doc.querySelector('main')?.textContent).toContain('available right now.');
      expect(doc.querySelector('meta[name="robots"]')).toBeNull();
    }
  });
  it('includes the locally hosted American Express logo in every generated footer', () => {
    for (const html of pages.values()) {
      const doc = new JSDOM(html).window.document;
      expect(doc.querySelector('footer img[alt="American Express"]')?.getAttribute('src'))
        .toBe('/images/payments/amex.png');
    }
  });
  it.each([
    ['/collections/', ['Home', 'Explore our handmade collections'], ['/', '/collections/']],
    ['/collections/toys/', ['Home', 'Collections', 'Handmade Toys'], ['/', '/collections/', '/collections/toys/']],
  ])('matches visible breadcrumbs and structured data at %s', (pathname, names, paths) => {
    const doc = documentFor(pathname);
    const nav = doc.querySelector('nav[aria-label="Breadcrumb"]')!;
    expect([...nav.children].map(item => item.textContent)).toEqual(names);
    expect([...nav.querySelectorAll('a')].map(link => link.getAttribute('href'))).toEqual(paths.slice(0, -1));
    const schema = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(schema.breadcrumb).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: names.map((name, index) => ({
        '@type': 'ListItem', position: index + 1, name, item: `https://luviacreations.com${paths[index]}`,
      })),
    });
  });

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
      expect(text).toContain(pathname === '/about/'
        ? 'does not take payment or confirm an order'
        : 'Adding items or sending a message does not confirm an order');
      expect(text).toContain(pathname === '/about/' ? 'Prices are in Indian rupees' : 'Product prices are in Indian rupees');
      expect(text).not.toContain('include GST');
      expect(text).toContain(pathname === '/about/'
        ? 'Shipping charges, if applicable, are shown before payment.'
        : 'Any shipping charge is shown in your checkout total before payment.');
      expect(text).toContain('Never share your card PIN, OTP or passwords');
      expect(text).not.toContain('Admin Razorpay');
      expect(text).not.toContain('sandbox demonstration');
      expect(text).not.toContain('when online checkout is available');
    }
    expect(documentFor('/faq/').body.textContent).not.toContain('Does this website take payment or complete checkout?');
    expect(documentFor('/collections/toys/').body.textContent).not.toContain('confirm shipping and dispatch before paying');
    expect(documentFor('/privacy-policy/').body.textContent).toContain('latest eight submitted search keywords');
  });
  it('creates populated collections, information pages and dedicated policies', () => {
    expect([...pages.keys()]).toEqual(['/collections/toys/', '/collections/hair-accessories/', '/bestsellers/', '/featured/', '/collections/', '/search/', '/about/', '/faq/', '/terms-and-conditions/', '/privacy-policy/', '/bulk-orders/']);
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
    for (const pathname of pages.keys()) {
      if (pathname === '/search/') expect(xml).not.toContain('<loc>https://luviacreations.com/search/</loc>');
      else expect(xml).toContain(`<loc>https://luviacreations.com${pathname}</loc>`);
    }
    expect(documentFor('/search/').querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow');
    expect(documentFor('/search/').querySelector('form[role="search"] input[name="q"]')).toBeTruthy();
    expect(xml).not.toContain('?category=');
    expect(buildContentPages([], '919205907350').has('/collections/toys/')).toBe(false);
  });

  it('adds clean category covers and fallback images only to indexable collection entries', () => {
    const cover = 'https://images.luviacreations.com/products/admin/look.webp';
    const categories = [
      { name: 'Toys', priority: 1, coverImage: cover },
      { name: 'Festive', priority: 2, isSeasonal: true, productIds: [toy.id], coverImage: cover },
      { name: 'Empty', priority: 3, coverImage: cover },
    ];
    const generated = buildContentPages([toy, hair], '919205907350', categories);
    const xml = renderContentSitemap([toy, hair], '2026-10-18', generated, categories);
    const doc = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
    const entries = [...doc.getElementsByTagName('url')];
    for (const pathname of ['/collections/toys/', '/collections/festive/']) {
      const entry = entries.find(node => node.querySelector('loc')?.textContent === `https://luviacreations.com${pathname}`)!;
      expect(entry.getElementsByTagNameNS('http://www.google.com/schemas/sitemap-image/1.1', 'loc')[0].textContent).toContain('look');
    }
    expect(xml).not.toContain('/collections/empty/');
    expect(xml).not.toContain('hotspot');
    const fallback = renderContentSitemap([toy], '2026-10-18', buildContentPages([toy], '919205907350'));
    const entry = fallback.split('<url>').find(node => node.includes('<loc>https://luviacreations.com/collections/toys/</loc>'))!;
    expect(entry).toContain('bunny');
    expect(entry).toContain('<image:image>');
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
