/**
 * Renders the published catalogue into the built HTML.
 *
 * The catalogue is a client-rendered SPA, so without this step the only thing
 * a crawler receives is an empty shell: every product name, price and
 * description arrives later over the Supabase API. AI crawlers such as GPTBot,
 * ClaudeBot and PerplexityBot do not run JavaScript, so none of the catalogue
 * was visible to them.
 *
 * After `vite build` this script:
 *   - replaces the shell markers in dist/index.html with the real catalogue,
 *   - writes a standalone static page per product under dist/p/<reference>/,
 *   - regenerates dist/sitemap.xml so those pages are discoverable.
 *
 * React replaces the injected markup when it mounts, so visitors still get the
 * interactive app and the rendered text always matches what a person sees.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const ORIGIN = 'https://luviacreations.com';
const FALLBACK_WHATSAPP_NUMBER = '919205907350';

const PRODUCT_SELECT =
  'id,name,category,description,materials,dimensions,included_items,care_instructions,price,show_price,in_stock,image_url,published_at,sort_order,created_at,' +
  'product_variants(id,name,color,price,in_stock,image_url,sort_order,product_variant_images(image_url,sort_order))';

// --- helpers mirrored from src/ (scripts/prerender.test.ts asserts parity) ---

export const toProductSlug = (product) =>
  product.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || product.id;

export const toProductReference = (product) => {
  const slug = toProductSlug(product);
  const id = product.id.toLowerCase();
  return slug === id ? id : `${slug}--${id}`;
};

const PUBLIC_IMAGE_PATH = '/storage/v1/object/public/product-images/';
const RENDER_IMAGE_PATH = '/storage/v1/render/image/public/product-images/';
const LEGACY_CATALOGUE_IMAGE_PATH = '/croche-catalogue/images/';

export const getProductImageUrl = (source, width) => {
  let url;
  try {
    url = new URL(source);
  } catch {
    return source;
  }

  if (
    url.protocol === 'https:' &&
    url.hostname.endsWith('.supabase.co') &&
    url.pathname.startsWith(PUBLIC_IMAGE_PATH)
  ) {
    url.pathname = url.pathname.replace(PUBLIC_IMAGE_PATH, RENDER_IMAGE_PATH);
    url.searchParams.set('width', String(width));
    url.searchParams.set('quality', '75');
    url.searchParams.set('resize', 'contain');
    return url.toString();
  }

  const R2_IMAGE_WIDTHS = [160, 480, 960];
  if (
    url.protocol === 'https:' &&
    (url.hostname === 'images.luviacreations.com' || url.hostname.endsWith('.r2.dev')) &&
    /^\/products\/[^/]+\/[^/]+\.webp$/.test(url.pathname)
  ) {
    const size = R2_IMAGE_WIDTHS.find((candidate) => candidate >= width);
    if (size) url.pathname = url.pathname.replace(/\.webp$/, `-w${size}.webp`);
    return url.toString();
  }

  if (
    url.hostname === 'singhalgoru.github.io' &&
    url.pathname.startsWith(LEGACY_CATALOGUE_IMAGE_PATH)
  ) {
    return `${ORIGIN}${url.pathname.replace('/croche-catalogue', '')}${url.search}`;
  }

  return source;
};

// --- rendering ---

export const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Keeps meta descriptions within the ~160 characters search engines show. */
export const truncate = (value, limit) => {
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

const formatPrice = (value) => `₹${value.toLocaleString('en-IN')}`;

const toProduct = (row) => {
  const variants = [...(row.product_variants ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  return {
    id: row.id,
    name: row.name,
    category: row.category ?? 'Crochet',
    description: row.description ?? '',
    materials: row.materials?.trim() || undefined,
    dimensions: row.dimensions?.trim() || undefined,
    includedItems: row.included_items?.trim() || undefined,
    careInstructions: row.care_instructions?.trim() || undefined,
    price: row.show_price === false ? null : (row.price ?? null),
    inStock: variants.length > 0
      ? variants.some((variant) => variant.in_stock !== false)
      : row.in_stock !== false,
    image: row.image_url ?? '',
    publishedAt: row.published_at ?? null,
    variants: variants.map((variant) => ({
      id: variant.id,
      name: variant.name ?? variant.color ?? '',
      image: variant.image_url ?? '',
      images: [...(variant.product_variant_images ?? [])]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((image) => image.image_url).filter(Boolean),
      price: variant.price ?? null,
      inStock: variant.in_stock !== false,
    })),
  };
};

/** Lowest and highest asking price across variants, for schema.org offers. */
const priceRange = (product) => {
  if (product.price === null) return null;
  const prices = product.variants
    .map((variant) => variant.price ?? product.price)
    .filter((price) => typeof price === 'number');
  const all = prices.length > 0 ? prices : [product.price];
  return { low: Math.min(...all), high: Math.max(...all) };
};

const whatsappLink = (product, number) =>
  `https://wa.me/${number}?text=${encodeURIComponent(
    `Hi Luvia, I would like to order/enquire about "${product.name}" from the ${product.category} collection.`,
  )}`;

const productUrl = (product) => product.url ?? `${ORIGIN}/p/${toProductReference(product)}/`;

const availability = (product) =>
  product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';

const productJsonLd = (product) => {
  const range = priceRange(product);
  const url = productUrl(product);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.name,
    description: product.description,
    category: product.category,
    url,
    image: product.image ? getProductImageUrl(product.image, 960) : undefined,
    brand: { '@type': 'Brand', name: 'Luvia Creations' },
    material: 'Crochet yarn',
    additionalProperty: {
      '@type': 'PropertyValue',
      name: 'Handmade',
      value: 'Yes',
    },
  };

  if (product.variants.length > 1) {
    data.hasVariant = product.variants.map((variant) => ({
      '@type': 'Product',
      name: `${product.name} — ${variant.name}`,
    }));
  }

  if (range) {
    data.offers =
      range.low === range.high
        ? {
            '@type': 'Offer',
            price: String(range.low),
            priceCurrency: 'INR',
            availability: availability(product),
            url,
            seller: { '@id': `${ORIGIN}/#store` },
          }
        : {
            '@type': 'AggregateOffer',
            lowPrice: String(range.low),
            highPrice: String(range.high),
            offerCount: String(product.variants.length),
            priceCurrency: 'INR',
            availability: availability(product),
            url,
            seller: { '@id': `${ORIGIN}/#store` },
          };
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      data,
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Catalogue', item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: product.category, item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 3, name: product.name, item: url },
        ],
      },
    ],
  };
};

/**
 * JSON-LD is embedded in a <script> element, so `<` and the closing sequence
 * must not be able to terminate it early.
 */
const jsonLdScript = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028|\u2029/g, '')}</script>`;

const groupByCategory = (products) => {
  const groups = new Map();
  for (const product of products) {
    const list = groups.get(product.category);
    if (list) list.push(product);
    else groups.set(product.category, [product]);
  }
  return [...groups];
};

const catalogueDescription = (products) => {
  const categories = groupByCategory(products).map(([category]) => category.toLowerCase());
  return categories.length > 0
    ? `Shop Luvia's handmade crochet ${categories.join(', ')}. Shipping across India.`
    : 'Explore handmade crochet accessories, gifts, toys and decor by Luvia, with shipping across India.';
};

const stockLabel = (product) => product.inStock ? 'In stock' : 'Sold out';

const priceLabel = (product) => {
  const range = priceRange(product);
  return !range
    ? 'Price on request'
    : range.low === range.high
      ? formatPrice(range.low)
      : `${formatPrice(range.low)} – ${formatPrice(range.high)}`;
};

const markdownText = (value) =>
  String(value).replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]<>#]/g, '\\$&');

const renderLlms = (template, products) => {
  const marker = /<!--catalogue-->[\s\S]*?<!--\/catalogue-->/;
  if (!marker.test(template)) throw new Error('llms.txt is missing the <!--catalogue--> markers');
  const categories = groupByCategory(products);
  const listing = [
    'Prices are in INR. Variant prices may differ; confirm current price and availability on the linked product page.',
    ...categories.map(([category, items]) => [
      `## ${markdownText(category)}`,
      ...items.map((product) =>
        `- [${markdownText(product.name)}](${productUrl(product)}): ${priceLabel(product)}. ${stockLabel(product)}.`,
      ),
    ].join('\n')),
  ].join('\n\n');
  return template.replace(marker, () => listing);
};

/**
 * The homepage listing deliberately carries no <img>: it is replaced within a
 * moment of load, and 30-plus image requests would compete with the real app
 * for bandwidth. Photographs belong on the product pages, which is also where
 * a crawler finds them.
 */
const renderShell = (products) => {
  const groups = groupByCategory(products);
  const categories = groups.map(([category]) => category);

  const sections = groups
    .map(([category, items]) => {
      const rows = items
        .map((product) => {
          const price = ` ${priceLabel(product)}.`;
          const stock = `${stockLabel(product)}.`;
          return [
            '<li>',
            `<article><h4><a href="/p/${toProductReference(product)}/">${escapeHtml(product.name)}</a></h4>`,
            `<p>${escapeHtml(truncate(product.description, 150))}</p>`,
            `<p>${escapeHtml(`${product.name} is a handmade crochet piece from the ${category} collection by Luvia Creations.${price} ${stock}`)}</p>`,
            '</article></li>',
          ].join('');
        })
        .join('');
      return `<section><h3>Handmade Crochet ${escapeHtml(category)}</h3><ul>${rows}</ul></section>`;
    })
    .join('');

  return [
    '<header>',
    '<h1>Handmade Crochet Products and Gifts in India</h1>',
    "<p>Browse Luvia Creations' handmade crochet catalogue. Every piece is crocheted by hand and shipped across India.</p>",
    '</header>',
    '<main>',
    `<h2>Explore the Luvia Crochet Collection</h2><p>${escapeHtml(
      `The catalogue has ${products.length} handmade crochet products across ${categories.length} categories: ${categories.join(', ')}. Order directly through WhatsApp or Instagram.`,
    )}</p>`,
    sections,
    '<section aria-labelledby="ordering-guide-title">',
    '<h2 id="ordering-guide-title">How to order &amp; delivery</h2>',
    '<ol><li>Choose your favourites: explore the products and select your preferred colour or variant.</li>',
    '<li>Add to cart: add available items, then review your selections and quantities in the cart.</li>',
    '<li>Send your order on WhatsApp: use the cart\'s WhatsApp option to send your order details. Your order is confirmed with us, not by adding items to the cart.</li></ol>',
    '<p>Shipping is available across India. Contact us to confirm shipping charges and the estimated dispatch time before payment.</p>',
    '<p><a href="mailto:orders@luviacreations.com">Email about an order</a></p>',
    '</section>',
    '</main>',
    '<footer><a href="/return-policy/">Return and refund policy</a></footer>',
  ].join('');
};

const catalogueJsonLd = (products) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  '@id': `${ORIGIN}/#catalogue`,
  name: 'Luvia Creations handmade crochet catalogue',
  numberOfItems: products.length,
  itemListElement: products.map((product, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: product.name,
    url: productUrl(product),
  })),
});

const PAGE_STYLE = `:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fdf6ec;color:#4a2c1d;line-height:1.6}
a{color:#8a4f2d}
.bar{padding:16px 20px;border-bottom:1px solid #ecd9c6}
.bar a{display:inline-flex;align-items:center;gap:10px;font-weight:700;text-decoration:none;color:#5f3825}
.bar img{width:36px;height:36px;border-radius:50%}
.wrap{max-width:860px;margin:0 auto;padding:28px 20px 56px}
.crumb{font-size:.85rem;margin:0 0 18px}
h1{font-size:1.7rem;margin:0 0 6px;color:#5f3825}
.cat{margin:0 0 18px;font-size:.95rem;color:#8a6b57}
.hero{width:100%;max-width:460px;height:auto;border-radius:16px;border:1px solid #ecd9c6;background:#fff}
.price{font-size:1.35rem;font-weight:700;margin:20px 0 4px;color:#5f3825}
.stock{margin:0 0 18px;font-size:.95rem}
.cta{display:inline-block;margin:6px 10px 6px 0;padding:11px 20px;border-radius:999px;background:#5f3825;color:#fff;text-decoration:none;font-weight:600}
.cta.alt{background:#fff;color:#5f3825;border:1px solid #d8bfa8}
ul.variants{padding-left:20px}
footer{margin-top:40px;padding-top:18px;border-top:1px solid #ecd9c6;font-size:.85rem;color:#8a6b57}`;

/**
 * People who open a shared link belong in the app's product view, while
 * crawlers (which mostly skip JavaScript, and are matched by user agent when
 * they do run it) keep the static page so it can be indexed and previewed.
 */
const appRedirectScript = (reference) =>
  `if(!/bot|crawl|spider|slurp|facebookexternalhit|whatsapp|lighthouse|headless/i.test(navigator.userAgent))location.replace(${JSON.stringify(
    `/#product=${encodeURIComponent(reference)}`,
  )})`;

const scriptHash = (source) => `'sha256-${createHash('sha256').update(source).digest('base64')}'`;

const renderProductPage = (product, whatsappNumber, socialImage = null, redirectToApp = true) => {
  const url = productUrl(product);
  const title = `${product.name} — Handmade Crochet ${product.category} | Luvia Creations`;
  const description = truncate(
    product.description || `${product.name}, a handmade crochet piece from the ${product.category} collection by Luvia Creations.`,
    155,
  );
  const image = product.image ? getProductImageUrl(product.image, 960) : `${ORIGIN}/images/luvia-logo.jpg`;
  // og:image points at the JPEG copy written next to the page when there is
  // one: WhatsApp skips WebP previews, and the same-origin file also keeps
  // the page photo visible when a visitor's resolver can't reach the image host.
  const shareImage = socialImage?.url ?? image;
  const redirect = appRedirectScript(toProductReference(product));
  const variantNames = product.variants.map((variant) => variant.name).filter(Boolean);
  const details = [
    ['Materials', product.materials],
    ['Dimensions', product.dimensions],
    ["What's included", product.includedItems],
    ['Care instructions', product.careInstructions],
  ]
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(([label, value]) =>
      `<section><h2>${escapeHtml(label)}</h2><p style="white-space:pre-line">${escapeHtml(value.trim())}</p></section>`,
    )
    .join('');

  const priceLine = priceLabel(product);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!-- Static page: the only script is the hash-pinned app redirect below. -->
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src ${scriptHash(redirect)}; img-src 'self' https://luviacreations.com https://singhalgoru.github.io https://*.supabase.co https://images.luviacreations.com https://*.r2.dev; style-src 'unsafe-inline'; base-uri 'self'; form-action 'none'"
    />
    ${redirectToApp ? `<script>${redirect}</script>` : ''}
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta name="theme-color" content="#5f3825" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" type="image/png" sizes="192x192" href="/images/favicon-192.png" />
    <link rel="apple-touch-icon" href="/images/apple-touch-icon.png" />
    <link rel="canonical" href="${url}" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="product" />
    <meta property="og:site_name" content="Luvia Creations" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${escapeHtml(shareImage)}" />
    ${
      socialImage
        ? `<meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="${socialImage.width}" />
    <meta property="og:image:height" content="${socialImage.height}" />
    `
        : ''
    }<meta property="og:image:alt" content="${escapeHtml(product.name)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(shareImage)}" />
    ${jsonLdScript(productJsonLd(product))}
    <style>${PAGE_STYLE}</style>
  </head>
  <body>
    <div class="bar">
      <a href="/"><img src="/images/favicon-96.png" width="36" height="36" alt="" />Luvia Creations</a>
    </div>
    <div class="wrap">
      <p class="crumb"><a href="/">Catalogue</a> › ${escapeHtml(product.category)} › ${escapeHtml(product.name)}</p>
      <h1>${escapeHtml(product.name)}</h1>
      <p class="cat">Handmade crochet from the ${escapeHtml(product.category)} collection by Luvia Creations</p>
      <img class="hero" src="${escapeHtml(shareImage)}" alt="${escapeHtml(`${product.name} — handmade crochet from the ${product.category} collection by Luvia Creations`)}" width="460" height="460" />
      <p class="price">${escapeHtml(priceLine)}</p>
      <p class="stock">${stockLabel(product)}. Message us to confirm delivery timing.</p>
      <p>${escapeHtml(product.description)}</p>
      ${details}
      ${
        variantNames.length > 0
          ? `<h2>Available colours and variants</h2><ul class="variants">${variantNames
              .map((name) => `<li>${escapeHtml(name)}</li>`)
              .join('')}</ul>`
          : ''
      }
      <p>
        <a class="cta" href="${escapeHtml(whatsappLink(product, whatsappNumber))}" rel="nofollow">Order on WhatsApp</a>
        <a class="cta alt" href="/#product=${encodeURIComponent(product.catalogueReference ?? toProductReference(product))}">View in the catalogue</a>
      </p>
      <footer>
        <p><a href="/return-policy/">Return and refund policy</a> · <a href="mailto:orders@luviacreations.com">Contact us</a></p>
        <p>Luvia Creations makes handmade crochet accessories, gifts, toys and decor, shipped across India.
        <a href="/">Browse the full catalogue</a> or follow
        <a href="https://www.instagram.com/luvia.craftedwithlove/" rel="noopener">@luvia.craftedwithlove</a>.</p>
      </footer>
    </div>
  </body>
</html>
`;
};

const renderSitemap = (products, today) => {
  const entry = (loc, lastmod) =>
    `  <url>\n    <loc>${escapeHtml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;

  const urls = [
    entry(`${ORIGIN}/`, today),
    entry(`${ORIGIN}/return-policy/`, '2026-10-02'),
    ...products.map((product) =>
      entry(
        productUrl(product),
        (product.publishedAt ?? today).slice(0, 10),
      ),
    ),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
};

// --- build step ---

const fetchProducts = async (supabaseUrl, anonKey) => {
  const endpoint = new URL('/rest/v1/products', supabaseUrl);
  endpoint.searchParams.set('select', PRODUCT_SELECT);
  endpoint.searchParams.set('published', 'eq.true');
  endpoint.searchParams.set('order', 'sort_order.asc,created_at.desc,id.asc');
  const pageSize = 1000;
  const products = [];
  for (let offset = 0; ; offset += pageSize) {
    endpoint.searchParams.set('limit', String(pageSize));
    endpoint.searchParams.set('offset', String(offset));
    const response = await fetch(endpoint.toString(), {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (!response.ok) {
      throw new Error(`Supabase responded ${response.status} ${response.statusText}`);
    }
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error('Supabase returned an invalid products response');
    products.push(...page.map(toProduct));
    if (page.length < pageSize) return products;
  }
};

const SOCIAL_IMAGE_SIZE = 800;

/**
 * Writes dist/p/<reference>/og.jpg from the product photo. Chat apps fetch
 * og:image themselves, and WhatsApp in particular skips WebP. Any failure
 * leaves the page on the WebP image rather than failing the deploy.
 */
const writeSocialImage = async (product, dir, reference) => {
  if (!product.image) return null;
  try {
    const response = await fetch(getProductImageUrl(product.image, 960));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { default: sharp } = await import('sharp');
    const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
      .rotate()
      .resize(SOCIAL_IMAGE_SIZE, SOCIAL_IMAGE_SIZE, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    await writeFile(path.join(dir, 'og.jpg'), data);
    return { url: `${ORIGIN}/p/${reference}/og.jpg`, width: info.width, height: info.height };
  } catch (error) {
    console.warn(`[prerender] No JPEG share image for ${product.name}: ${error.message}`);
    return null;
  }
};

const injectShell = (html, products) => {
  const shell = /<!--shell-->[\s\S]*?<!--\/shell-->/;
  if (!shell.test(html)) {
    throw new Error('index.html is missing the <!--shell--> markers');
  }
  const description = catalogueDescription(products);
  return html
    .replace(/(<meta\s+(?:name="(?:description|twitter:description)"|property="og:description")\s+content=")[^"]*(")/g,
      (_, before, after) => `${before}${escapeHtml(description)}${after}`)
    .replace(/("description":\s*")[^"]*(")/,
      () => `"description":${JSON.stringify(description).replace(/</g, '\\u003c')}`)
    .replace(shell, () => `<!--shell-->${renderShell(products)}<!--/shell-->`)
    .replace('</head>', `${jsonLdScript(catalogueJsonLd(products))}</head>`);
};

const main = async () => {
  const env = { ...loadEnv('production', ROOT, 'VITE_'), ...process.env };
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const whatsappNumber = env.VITE_WHATSAPP_NUMBER?.trim() || FALLBACK_WHATSAPP_NUMBER;

  if (!supabaseUrl || !anonKey) {
    if (process.env.CI) {
      throw new Error('Supabase is not configured; refusing to deploy an outdated catalogue and sitemap.');
    }
    console.warn('[prerender] Supabase is not configured — leaving the built shell as is.');
    return;
  }

  const products = await fetchProducts(supabaseUrl, anonKey);

  const indexPath = path.join(DIST, 'index.html');
  await writeFile(indexPath, injectShell(await readFile(indexPath, 'utf8'), products));

  for (const product of products) {
    const reference = toProductReference(product);
    const dir = path.join(DIST, 'p', reference);
    await mkdir(dir, { recursive: true });
    const socialImage = await writeSocialImage(product, dir, reference);
    await writeFile(
      path.join(dir, 'index.html'),
      renderProductPage(product, whatsappNumber, socialImage),
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  await writeFile(path.join(DIST, 'sitemap.xml'), renderSitemap(products, today));
  await writeFile(
    path.join(DIST, 'llms.txt'),
    renderLlms(await readFile(path.join(ROOT, 'public', 'llms.txt'), 'utf8'), products),
  );

  console.log(`[prerender] Rendered ${products.length} products into the initial HTML.`);
};

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    console.error(`[prerender] Failed: ${error.message}`);
    process.exit(1);
  });
}

export { fetchProducts, injectShell, renderLlms, renderProductPage, renderShell, renderSitemap, toProduct, priceRange };
