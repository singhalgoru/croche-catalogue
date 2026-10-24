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
import storeContent from '../src/content/storeContent.json' with { type: 'json' };
import bulkOrders from '../src/content/bulkOrders.json' with { type: 'json' };
import { collectionPath } from '../src/utils/collectionLink.js';
import { getCategoryImage } from '../src/utils/categoryImage.js';
import { fetchVideoUploadDate, renderVideoPage, videoPath, videoPlayer, videoSchema, videoSitemapEntry } from './video-pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const ORIGIN = 'https://luviacreations.com';
const FALLBACK_WHATSAPP_NUMBER = '919205907350';

const PRODUCT_SELECT =
  'id,public_slug,name,category,description,seo_description,materials,dimensions,included_items,care_instructions,price,regular_price,discount_percent,show_price,color,in_stock,featured,image_url,image_path,published,published_at,updated_at,sort_order,created_at,' +
  'product_variants(id,public_slug,name,color,price,regular_price,in_stock,available_quantity,image_url,image_path,sort_order,product_variant_images(id,image_url,image_path,sort_order)),product_making_videos(video_url,poster_url,duration_seconds,width,height,title)';

// --- helpers mirrored from src/ (scripts/prerender.test.ts asserts parity) ---

export const getProductMetaDescription = (product) => {
  if (product.seoDescription?.trim()) return product.seoDescription.trim();
  const text = product.description.replace(/\s+/g, ' ').trim();
  if (/[.!?]$/.test(text) && text.length <= 160) return text;
  const first = text.match(/^.+?[.!?](?=\s|$)/)?.[0];
  if (first && first.length <= 160) return first;
  const name = product.name.replace(/\s+/g, ' ').trim();
  const category = product.category.replace(/\s+/g, ' ').trim();
  return `${name}: handmade crochet from Luvia Creations' ${category} collection. Shipped across India.`;
};

export const toProductSlug = (product) =>
  product.publicSlug || product.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `product-${String(product.id).replace(/-/g, '').slice(0, 8)}`;

export const toProductReference = (product) => {
  const slug = product.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || product.id;
  const id = product.id.toLowerCase();
  return slug === id ? id : `${slug}--${id}`;
};

export const toVariantSlug = (variant) => !variant ? 'standard' : variant.publicSlug || variant.name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || `variant-${String(variant.id).toLowerCase().replace(/-/g, '').slice(0, 8)}`;

export const variantShareProduct = (product, variant) => ({
  ...product,
  name: product.variants.length > 1 ? `${product.name} — ${variant.name}` : product.name,
  image: variant.image || product.image,
  price: product.price === null ? null : variant.price ?? product.price,
  regularPrice: variant.price !== null ? variant.regularPrice : product.regularPrice,
  inStock: variant.inStock,
  variants: [variant],
  catalogueReference: toProductSlug(product),
  url: `${ORIGIN}/p/${toProductSlug(product)}/variant/${toVariantSlug(variant)}/`,
});

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
  const video = Array.isArray(row.product_making_videos) ? row.product_making_videos[0] : row.product_making_videos;
  const variants = [...(row.product_variants ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  return {
    id: row.id,
    publicSlug: row.public_slug ?? undefined,
    name: row.name.trim(),
    category: row.category ?? 'Crochet',
    description: row.description ?? '',
    seoDescription: row.seo_description?.trim() || undefined,
    materials: row.materials?.trim() || undefined,
    dimensions: row.dimensions?.trim() || undefined,
    includedItems: row.included_items?.trim() || undefined,
    careInstructions: row.care_instructions?.trim() || undefined,
    makingVideo: video ? {
      title: video.title,
      videoUrl: video.video_url,
      posterUrl: video.poster_url,
      durationSeconds: Number(video.duration_seconds),
      width: video.width,
      height: video.height,
    } : undefined,
    price: row.show_price === false ? null : (row.price ?? null),
    regularPrice: row.regular_price ?? null,
    discountPercent: row.discount_percent ?? 0,
    featured: row.featured === true,
    sortOrder: row.sort_order ?? undefined,
    inStock: variants.length > 0
      ? variants.some((variant) => variant.in_stock !== false && variant.available_quantity > 0)
      : row.in_stock !== false,
    image: row.image_url ?? '',
    publishedAt: row.published_at ?? null,
    updatedAt: row.updated_at ?? null,
    createdAt: row.created_at ?? null,
    variants: variants.map((variant) => ({
      id: variant.id,
      publicSlug: variant.public_slug ?? undefined,
      name: variant.name ?? variant.color ?? '',
      image: variant.image_url ?? '',
      images: [...(variant.product_variant_images ?? [])]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((image) => image.image_url).filter(Boolean),
      price: variant.price ?? null,
      regularPrice: variant.regular_price ?? null,
      inStock: variant.in_stock !== false && variant.available_quantity > 0,
      availableQuantity: variant.available_quantity ?? 0,
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
    `Hi Luvia, I'm interested in ${product.name}.\n\n${productUrl(product)}`,
  )}`;

const productUrl = (product) => product.url ?? `${ORIGIN}/p/${toProductSlug(product)}/`;

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
      ...(product.makingVideo ? [videoSchema(product)] : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: product.category, item: `${ORIGIN}${collectionPath(product.category)}` },
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

const catalogueDescription = () =>
  'Shop handmade crochet gajras, hair accessories, charms, toys and home decor by Luvia Creations. Crafted in India, shipped nationwide. Secure online checkout.';

const stockLabel = (product) => product.inStock ? 'In stock' : 'Out of stock';

const priceLabel = (product) => {
  const range = priceRange(product);
  return !range
    ? 'Price on request'
    : range.low === range.high
      ? formatPrice(range.low)
      : `${formatPrice(range.low)} – ${formatPrice(range.high)}`;
};

const discountMarkup = (product) => {
  if (!product.discountPercent || product.price === null || !product.regularPrice || product.regularPrice <= product.price) return '';
  const regular = {
    ...product, price: product.regularPrice,
    variants: product.variants.map(variant => ({ ...variant, price: variant.regularPrice ?? null })),
  };
  return `<p><del>${escapeHtml(priceLabel(regular))}</del> <strong>${product.discountPercent}% off</strong></p>`;
};

const markdownText = (value) =>
  String(value).replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]<>#]/g, '\\$&');

const whatsappContactDetails = (number) => {
  const digits = String(number).replace(/\D/g, '');
  if (!digits) throw new Error('WhatsApp contact number must contain digits.');
  const display = /^91\d{10}$/.test(digits)
    ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
    : `+${digits}`;
  return { digits, display };
};

const renderLlms = (template, products, whatsappNumber = FALLBACK_WHATSAPP_NUMBER, categorySettings = []) => {
  const marker = /<!--catalogue-->[\s\S]*?<!--\/catalogue-->/;
  if (!marker.test(template)) throw new Error('llms.txt is missing the <!--catalogue--> markers');
  // Seasonal collections hold products by membership, not by product.category.
  const seasonal = categorySettings
    .filter(category => category.isSeasonal && category.visible !== false)
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
    .map(category => [category.name, products.filter(product => category.productIds?.includes(product.id))])
    .filter(([, items]) => items.length > 0);
  const seasonalNames = new Set(seasonal.map(([name]) => name));
  const categories = [...seasonal, ...groupByCategory(products).filter(([name]) => !seasonalNames.has(name))];
  const listing = [
    'Prices are in INR. Variant prices may differ; confirm current price and availability on the linked product page.',
    ...categories.map(([category, items]) => {
      const image = getCategoryImage(items, categorySettings.find(settings => settings.name === category));
      return [
      `## ${markdownText(category)}`,
      `Collection: [${markdownText(category)}](${ORIGIN}${collectionPath(category)}).`,
      ...(/^https:\/\//.test(image) ? [`Collection image: ${getProductImageUrl(image, 960)}`] : []),
      ...(seasonalNames.has(category)
        ? [`Seasonal collection: [${markdownText(category)}](${ORIGIN}${collectionPath(category)}). Products also appear under their regular categories.`]
        : []),
      ...items.map((product) =>
        `- [${markdownText(product.name)}](${productUrl(product)}): ${priceLabel(product)}. ${stockLabel(product)}.`,
      ),
      ].join('\n');
    }),
  ].join('\n\n');
  const contact = whatsappContactDetails(whatsappNumber);
  return template
    .replace(marker, () => listing)
    .replaceAll('{{WHATSAPP_DISPLAY_NUMBER}}', contact.display)
    .replaceAll('{{WHATSAPP_NUMBER}}', contact.digits);
};

const INITIAL_NEW_PRODUCT_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

const compareInitialProducts = (left, right, now = Date.now()) => {
  const isNew = (product) => {
    const publishedAt = Date.parse(product.publishedAt);
    const age = now - publishedAt;
    return Number.isFinite(publishedAt) && age >= 0 && age < INITIAL_NEW_PRODUCT_DURATION_MS;
  };
  return Number(Boolean(right.featured)) - Number(Boolean(left.featured))
    || Number(isNew(right)) - Number(isNew(left))
    || (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
};

const renderShell = (products, categorySettings = []) => {
  const orderedProducts = [...products].sort(compareInitialProducts);
  const firstProductId = orderedProducts[0]?.id;
  const groups = groupByCategory(orderedProducts);
  const categories = groups.map(([category]) => category);
  const collectionNames = [...new Set([
    ...[...categorySettings]
      .sort((a, b) => Number(Boolean(b.isSeasonal)) - Number(Boolean(a.isSeasonal)) || a.priority - b.priority)
      .map(category => category.name),
    ...categories,
  ])].filter(name => {
    const settings = categorySettings.find(category => category.name === name);
    return settings?.visible !== false && (settings?.isSeasonal
      ? products.some(product => settings.productIds?.includes(product.id))
      : categories.includes(name));
  });

  const sections = groups
    .map(([category, items]) => {
      const rows = items
        .map((product) => {
          const price = ` ${priceLabel(product)}.`;
          const stock = `${stockLabel(product)}.`;
          const image = product.id === firstProductId && product.image
            ? `<img src="${escapeHtml(getProductImageUrl(product.image, 480))}" width="480" height="480" loading="eager" fetchpriority="high" decoding="async" alt="${escapeHtml(product.name)}" />`
            : '';
          return [
            '<li>',
            `<article>${image}<h4><a href="/p/${toProductSlug(product)}/">${escapeHtml(product.name)}</a></h4>`,
            `<p>${escapeHtml(truncate(product.description, 150))}</p>`,
            `<p>${escapeHtml(`${price.trim()} ${stock}`)}</p>`,
            discountMarkup(product),
            '</article></li>',
          ].join('');
        })
        .join('');
      return `<section><h3>Handmade Crochet ${escapeHtml(category)}</h3><ul>${rows}</ul></section>`;
    })
    .join('');

  return [
    '<header>',
    '<h1>Premium Handmade Crochet Creations</h1>',
    "<p>Discover thoughtfully crafted crochet accessories, gifts, toys and decor by Luvia. Handmade in India and shipped nationwide.</p>",
    '</header>',
    '<nav aria-label="Main navigation"><a href="/">Shop all</a> · <a href="/collections/">Collections</a> · <a href="/about/">About &amp; contact</a> · <a href="/faq/">Ordering FAQ</a> · <a href="/bulk-orders/">Bulk orders &amp; corporate gifting</a></nav>',
    '<main>',
    `<h2>Explore the Luvia Crochet Collection</h2><p>${escapeHtml(
      `The catalogue has ${products.length} handmade crochet products across ${categories.length} categories: ${categories.join(', ')}. Add your favourites to the cart, review delivery and pay securely through Razorpay.`,
    )}</p>`,
    sections,
    '<section aria-labelledby="collections-heading"><h2 id="collections-heading">Explore collections</h2>',
    `<nav aria-label="Explore collections"><ul>${collectionNames.map(name =>
      `<li><a href="${collectionPath(name)}">${escapeHtml(name)}</a></li>`).join('')}</ul></nav></section>`,
    '<section aria-labelledby="ordering-guide-title">',
    '<h2 id="ordering-guide-title">How ordering and delivery work</h2>',
    '<ol><li>Choose your items: select an available product and colour or variant, then add it to your cart.</li>',
    '<li>Review your order: save your delivery address and review items, coupons, shipping and the total. Adding items to your cart or sending a message does not confirm an order.</li>',
    '<li>Proceed to payment: pay securely through Razorpay. Your online order is confirmed after payment verification. Use WhatsApp for help or assisted ordering if checkout is unavailable.</li></ol>',
    `<p>${escapeHtml(storeContent.dispatch)}</p>`,
    `<p>${escapeHtml(storeContent.shipping)}</p>`,
    `<p>${escapeHtml(storeContent.orderingDisclosure.request)}</p>`,
    `<p>${escapeHtml(storeContent.orderingDisclosure.price)}</p>`,
    '<p><a href="mailto:orders@luviacreations.com">Email about an order</a></p>',
    '</section>',
    `<section id="bulk-orders" aria-labelledby="bulk-orders-heading"><h2 id="bulk-orders-heading">${escapeHtml(bulkOrders.title)}</h2>`,
    `<p>${escapeHtml(bulkOrders.invitation)}</p>`,
    `<p><a href="${bulkOrders.path}">${escapeHtml(bulkOrders.invitationCta)}</a></p></section>`,
    '</main>',
    '<footer><a href="/collections/">Explore collections</a> · <a href="/about/">About &amp; contact</a> · <a href="/faq/">Ordering FAQ</a> · <a href="/return-policy/">Return and refund policy</a> · <a href="/terms-and-conditions/">Terms &amp; Conditions</a> · <a href="/privacy-policy/">Privacy Policy</a> · <a href="/bulk-orders/">Bulk orders &amp; corporate gifting</a></footer>',
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
.bar nav{display:flex;flex-wrap:wrap;gap:12px 24px;margin-top:12px}
.skip{position:absolute;left:-10000px}.skip:focus{left:16px;top:8px;background:white;padding:8px}
a:focus-visible,summary:focus-visible{outline:3px solid #5f3825;outline-offset:4px}
.wrap{max-width:860px;margin:0 auto;padding:28px 20px 56px}
.crumb{font-size:.85rem;margin:0 0 18px}
h1{font-size:1.7rem;margin:0 0 6px;color:#5f3825}
.cat{margin:0 0 18px;font-size:.95rem;color:#8a6b57}
.hero{width:100%;max-width:460px;height:auto;border-radius:16px;border:1px solid #ecd9c6;background:#fff}
.gallery{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}.gallery img{width:160px;height:160px;object-fit:contain;border-radius:12px}
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
  const title = `${product.name} | Luvia Creations`;
  const description = getProductMetaDescription(product);
  const image = product.image ? getProductImageUrl(product.image, 960) : `${ORIGIN}/images/luvia-logo.jpg`;
  // Keep JPEG social previews for WhatsApp; use the sized image in the page.
  const shareImage = socialImage?.url ?? image;
  const redirect = appRedirectScript(toProductSlug(product));
  const variantNames = product.variants.map((variant) => variant.name).filter(Boolean);
  const gallery = product.variants.flatMap(variant => [
    { image: variant.image, alt: `${product.name} — ${variant.name}` },
    ...(variant.images ?? []).map((image, index) => ({ image, alt: `${product.name} — ${variant.name}, photo ${index + 2}` })),
  ]).filter((photo, index, photos) =>
    photo.image && photo.image !== product.image && photos.findIndex(item => item.image === photo.image) === index,
  ).slice(0, 5);
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
    <a class="skip" href="#main">Skip to content</a>
    <header class="bar">
      <a href="/"><img src="/images/favicon-96.png" width="36" height="36" alt="" />Luvia Creations</a>
      <nav aria-label="Main navigation"><a href="/">Shop all</a><a href="/collections/">Collections</a><a href="/about/">About &amp; contact</a><a href="/faq/">Ordering FAQ</a></nav>
    </header>
    <main id="main" class="wrap">
      <nav class="crumb" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="${collectionPath(product.category)}">${escapeHtml(product.category)}</a> › <span aria-current="page">${escapeHtml(product.name)}</span></nav>
      <h1>${escapeHtml(product.name)}</h1>
      <p class="cat">Handmade crochet from the ${escapeHtml(product.category)} collection by Luvia Creations</p>
      <img class="hero" src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" width="460" height="460" fetchpriority="high" decoding="async" />
      ${gallery.length ? `<div class="gallery" aria-label="Product photos">${gallery.map(photo =>
        `<img src="${escapeHtml(getProductImageUrl(photo.image, 480))}" alt="${escapeHtml(photo.alt)}" width="160" height="160" loading="lazy" decoding="async" />`,
      ).join('')}</div>` : ''}
      <p class="price">${escapeHtml(priceLine)}</p>
      ${discountMarkup(product)}
      ${product.price !== null ? '<p>Shipping calculated at checkout</p>' : ''}
      <p class="stock">${stockLabel(product)}.</p>
      <p>Free shipping on items worth ₹500 or more after coupon discounts.</p>
      <p>${escapeHtml(product.description)}</p>
      ${details}
      ${product.makingVideo ? `<section id="making-video"><h2>See how it is made</h2>${videoPlayer(product)}<p><a href="${videoPath(product)}">Open making video page</a></p></section>` : ''}
      ${
        variantNames.length > 1
          ? `<h2>Available colours and variants</h2><ul class="variants">${variantNames
              .map((name) => `<li>${escapeHtml(name)}</li>`)
              .join('')}</ul>`
          : ''
      }
      <p>
        <a class="cta" href="/#product=${encodeURIComponent(product.catalogueReference ?? toProductSlug(product))}">Choose options in the catalogue</a>
        <a class="cta alt" href="${escapeHtml(whatsappLink(product, whatsappNumber))}" rel="nofollow">Ask on WhatsApp</a>
      </p>
      <p>Shopping without JavaScript? Contact Luvia for assisted ordering.</p>
      <details><summary>Delivery and shipping</summary><p>${escapeHtml(storeContent.dispatch)}</p><p>${escapeHtml(storeContent.shipping)}</p></details>
      <section aria-labelledby="order-information-title">
        <h2 id="order-information-title">${escapeHtml(storeContent.orderingDisclosure.title)}</h2>
        <p>${escapeHtml(storeContent.orderingDisclosure.request)}</p>
        <p>${escapeHtml(storeContent.orderingDisclosure.price)}</p>
        <p>${escapeHtml(storeContent.orderingDisclosure.payment)}</p>
        <p><a href="/faq/">Shipping &amp; payment information</a> · <a href="/about/">About &amp; contact</a></p>
      </section>
      <footer>
        <p><a href="/return-policy/">Return and refund policy</a> · <a href="/terms-and-conditions/">Terms &amp; Conditions</a> · <a href="/privacy-policy/">Privacy Policy</a> · <a href="/bulk-orders/">Bulk orders &amp; corporate gifting</a> · <a href="mailto:orders@luviacreations.com">Contact us</a></p>
        <p>Luvia Creations makes handmade crochet accessories, gifts, toys and decor, shipped across India.
        <a href="/">Browse the full catalogue</a> or follow
        <a href="https://www.instagram.com/luvia.craftedwithlove/" rel="noopener">@luvia.craftedwithlove</a>.</p>
      </footer>
    </main>
  </body>
</html>
`;
};

const sitemapImages = (product) => [
  product.image,
  ...product.variants.flatMap(variant => [variant.image, ...(variant.images ?? [])]),
].filter((image, index, images) => image && images.indexOf(image) === index)
  .map(image => getProductImageUrl(image, 960))
  .filter((image, index, images) => /^https:\/\//.test(image) && images.indexOf(image) === index);

const renderSitemap = (products, today, additionalPaths = []) => {
  const entry = (loc, lastmod, images = []) =>
    `  <url>\n    <loc>${escapeHtml(loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}${images
      .map(image => `\n    <image:image>\n      <image:loc>${escapeHtml(image)}</image:loc>\n    </image:image>`).join('')}\n  </url>`;
  const productLastmod = (product) => {
    for (const value of [product.updatedAt, product.publishedAt]) {
      if (typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value))) {
        return new Date(value).toISOString().slice(0, 10);
      }
    }
    console.warn(`[prerender] Omitting sitemap lastmod for ${product.name}: no valid modification or publication date.`);
    return null;
  };

  const urls = [
    entry(`${ORIGIN}/`, today),
    entry(`${ORIGIN}/return-policy/`, '2026-10-02'),
    ...products.map((product) =>
      entry(
        productUrl(product),
        productLastmod(product),
        sitemapImages(product),
      ),
    ),
    ...products.filter(product => product.makingVideo).map(product =>
      `  <url><loc>${ORIGIN}${videoPath(product)}</loc>${videoSitemapEntry(product)}</url>`),
    ...additionalPaths.map(page => typeof page === 'string'
      ? entry(`${ORIGIN}${page}`, null)
      : entry(`${ORIGIN}${page.pathname}`, null, page.images)),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${urls.join('\n')}\n</urlset>\n`;
};

// --- build step ---

const fetchProductRows = async (supabaseUrl, anonKey) => {
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
    products.push(...page);
    if (page.length < pageSize) return products;
  }
};

const fetchProducts = async (supabaseUrl, anonKey) =>
  (await fetchProductRows(supabaseUrl, anonKey)).map(toProduct);

export const fetchBootstrapCategories = async (supabaseUrl, anonKey) => {
  const endpoint = new URL('/rest/v1/categories', supabaseUrl);
  endpoint.searchParams.set('select', 'name,sort_order,is_seasonal,visible,overview,featured_ticker,cover_image_url,image_hotspots,seasonal_category_products(product_id)');
  endpoint.searchParams.set('order', 'sort_order.asc,name.asc');
  const response = await fetch(endpoint, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
  if (!response.ok) throw new Error(`Unable to load bootstrap categories: ${response.status} ${response.statusText}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Supabase returned invalid bootstrap categories');
  return rows.map(row => ({ name: row.name, priority: row.sort_order,
    isSeasonal: row.is_seasonal ?? false, visible: row.visible ?? true,
    productIds: row.seasonal_category_products?.map(item => item.product_id) ?? [],
    overview: row.overview ?? '', featuredTicker: row.featured_ticker ?? false, coverImage: row.cover_image_url ?? '', imageHotspots: row.image_hotspots ?? [] }))
    .sort((a, b) => Number(b.isSeasonal) - Number(a.isSeasonal) || a.priority - b.priority || a.name.localeCompare(b.name));
};

export const fetchBootstrapBestsellers = async (supabaseUrl, anonKey) => {
  try {
    const response = await fetch(new URL('/rest/v1/rpc/get_catalogue_bestsellers', supabaseUrl), {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row.product_id !== 'string')) {
      throw new Error('invalid response');
    }
    return [...new Set(rows.map(row => row.product_id))].slice(0, 6);
  } catch (error) {
    // Bestsellers are an enhancement: the app still fetches them at runtime.
    console.warn(`[prerender] Bestseller snapshot unavailable (${error instanceof Error ? error.message : error}).`);
    return [];
  }
};

export const injectCatalogueBootstrap = (html, rows, categories, homepage, bestsellers = []) =>
  html.replace('</head>', `<script id="catalogue-bootstrap" type="application/json">${
    JSON.stringify({ products: rows, categories, homepage, bestsellers }).replace(/</g, '\\u003c')
  }</script></head>`);

/** Mirrors Bestsellers.tsx: the first ranked product with a purchasable variant, as its blurred-backdrop and card URLs. */
export const firstBestsellerImageUrls = (rows, bestsellers) => {
  for (const id of bestsellers) {
    const row = rows.find(candidate => candidate.id === id);
    if (!row) continue;
    const variants = [...(row.product_variants ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const resolved = variants.length > 0 ? variants
      : [{ in_stock: row.in_stock, available_quantity: row.in_stock ? 1 : 0, image_url: row.image_url }];
    const variant = resolved.find(item => item.in_stock && item.available_quantity > 0);
    if (!variant) continue;
    const image = variant.image_url ?? resolved[0].image_url;
    return image ? [getProductImageUrl(image, 160), getProductImageUrl(image, 480)] : [];
  }
  return [];
};

// Lets the browser fetch the likely LCP photos straight from the HTML instead of after the app bundle runs.
export const injectImagePreloads = (html, urls) => urls.length === 0 ? html : html.replace(/<head>/, `<head>${
  [...new Set(urls)].map(url => `\n    <link rel="preload" as="image" href="${escapeHtml(url)}" fetchpriority="high" />`).join('')}`);

const SOCIAL_IMAGE_SIZE = 800;

/**
 * Writes dist/p/<reference>/og.jpg from the product photo. Chat apps fetch
 * og:image themselves, and WhatsApp in particular skips WebP. Any failure
 * leaves the page on the WebP image rather than failing the deploy.
 */
export const writeSocialImage = async (product, dir, pathname) => {
  if (!product.image) return null;
  try {
    const response = await fetch(getProductImageUrl(product.image, 960));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { default: sharp } = await import('sharp');
    const output = sharp(Buffer.from(await response.arrayBuffer()))
      .rotate()
      .resize(SOCIAL_IMAGE_SIZE, SOCIAL_IMAGE_SIZE, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' });
    const { data, info } = await output.jpeg({ quality: 80, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    const filename = pathname.startsWith('/collections/') ? `og-${createHash('sha256').update(data).digest('hex').slice(0, 12)}.jpg` : 'og.jpg';
    await writeFile(path.join(dir, filename), data);
    return { url: `${ORIGIN}${pathname}${filename}`, width: info.width, height: info.height };
  } catch (error) {
    console.warn(`[prerender] No JPEG share image for ${product.name}: ${error.message}`);
    return null;
  }
};

const injectShell = (html, products, whatsappNumber = FALLBACK_WHATSAPP_NUMBER, categories = []) => {
  const shell = /<!--shell-->[\s\S]*?<!--\/shell-->/;
  if (!shell.test(html)) {
    throw new Error('index.html is missing the <!--shell--> markers');
  }
  const description = catalogueDescription(products);
  const { display } = whatsappContactDetails(whatsappNumber);
  return html
    .replace(/(<meta\s+(?:name="(?:description|twitter:description)"|property="og:description")\s+content=")[^"]*(")/g,
      (_, before, after) => `${before}${escapeHtml(description)}${after}`)
    .replace(/("description":\s*")[^"]*(")/,
      () => `"description":${JSON.stringify(description).replace(/</g, '\\u003c')}`)
    .replace(shell, () => `<!--shell-->${renderShell(products, categories)}<!--/shell-->`)
    .replaceAll('{{WHATSAPP_PHONE}}', display)
    .replace('</head>', `${jsonLdScript(catalogueJsonLd(products))}</head>`);
};

const attachProductApp = (page, template) => {
  const bootstrap = template.match(/<script id="catalogue-bootstrap" type="application\/json">[\s\S]*?<\/script>/)?.[0] ?? '';
  const cspPattern = /<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/;
  const csp = template.match(cspPattern)?.[0];
  const scripts = template.match(/<script\b[^>]*type="module"[^>]*>[\s\S]*?<\/script>/g) ?? [];
  const links = (template.match(/<link\b[^>]*>/g) ?? [])
    .filter((link) => /rel="(?:stylesheet|modulepreload|manifest)"/.test(link));
  if (!csp || scripts.length === 0 || links.length === 0) {
    throw new Error('Built template is missing the product app assets or CSP.');
  }
  return page
    .replace(cspPattern, csp)
    .replace('<style>', '<style id="product-fallback-style">')
    .replace('</head>', `${bootstrap}\n${links.join('\n')}\n${scripts.join('\n')}\n</head>`)
    .replace('<body>', '<body><div id="root">')
    .replace('</body>', '</div></body>');
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

  const [rows, categories, bestsellers] = await Promise.all([
    fetchProductRows(supabaseUrl, anonKey),
    fetchBootstrapCategories(supabaseUrl, anonKey),
    fetchBootstrapBestsellers(supabaseUrl, anonKey),
  ]);
  const products = rows.map(toProduct);
  await Promise.all(products.filter(product => product.makingVideo).map(async product => {
    product.makingVideo.uploadDate = await fetchVideoUploadDate(product);
  }));
  const homepage = {
    title: 'Premium Handmade Crochet in India | Luvia Creations',
    description: catalogueDescription(products),
    canonical: `${ORIGIN}/`,
  };

  const indexPath = path.join(DIST, 'index.html');
  const template = injectCatalogueBootstrap(await readFile(indexPath, 'utf8'), rows, categories, homepage, bestsellers);
  await writeFile(indexPath, injectImagePreloads(injectShell(template, products, whatsappNumber, categories),
    firstBestsellerImageUrls(rows, bestsellers)));

  for (const product of products) {
    const slug = toProductSlug(product);
    const dir = path.join(DIST, 'p', slug);
    await mkdir(dir, { recursive: true });
    if (product.makingVideo) {
      const watchDir = path.join(DIST, 'watch', slug);
      await mkdir(watchDir, { recursive: true });
      await writeFile(path.join(watchDir, 'index.html'), attachProductApp(renderVideoPage(product), template));
    }
    const socialImage = await writeSocialImage(product, dir, `/p/${slug}/`);
    await writeFile(
      path.join(dir, 'index.html'),
      attachProductApp(renderProductPage(product, whatsappNumber, socialImage, false), template),
    );
    for (const variant of product.variants) {
      const reference = `${slug}/variant/${toVariantSlug(variant)}`;
      const variantDir = path.join(dir, 'variant', toVariantSlug(variant));
      await mkdir(variantDir, { recursive: true });
      const shareProduct = variantShareProduct(product, variant);
      const variantImage = await writeSocialImage(shareProduct, variantDir, `/p/${reference}/`);
      await writeFile(
        path.join(variantDir, 'index.html'),
        attachProductApp(renderProductPage(shareProduct, whatsappNumber, variantImage, false), template),
      );
    }
    const legacyDir = path.join(DIST, 'p', toProductReference(product));
    if (legacyDir !== dir) {
      await mkdir(legacyDir, { recursive: true });
      await writeFile(
        path.join(legacyDir, 'index.html'),
        attachProductApp(renderProductPage(product, whatsappNumber, socialImage, false), template),
      );
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const { buildContentPages, renderContentSitemap } = await import('./content-pages.mjs');
  const contentPages = buildContentPages([...products].sort(compareInitialProducts), whatsappNumber, categories, bestsellers);
  for (const [pathname, html] of contentPages) {
    const dir = path.join(DIST, ...pathname.split('/').filter(Boolean).map(decodeURIComponent));
    await mkdir(dir, { recursive: true });
    let content = html;
    const category = categories.find(item => collectionPath(item.name) === pathname && item.visible !== false);
    if (category) {
      const items = products.filter(product => category.isSeasonal ? category.productIds?.includes(product.id) : product.category === category.name);
      const image = getCategoryImage(items, category);
      const socialImage = items.length && image ? await writeSocialImage(
        { name: category.name, image }, dir, pathname,
      ) : null;
      if (socialImage) content = content.replace(
        /(<meta (?:property="og:image"|name="twitter:image") content=")[^"]*(")/g,
        (_, before, after) => `${before}${escapeHtml(socialImage.url)}${after}`,
      ).replace('</head>', `<meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="${socialImage.width}"><meta property="og:image:height" content="${socialImage.height}"></head>`);
    }
    await writeFile(path.join(dir, 'index.html'), attachProductApp(content, template));
  }
  await writeFile(path.join(DIST, 'sitemap.xml'), renderContentSitemap(products, today, contentPages, categories));
  await writeFile(
    path.join(DIST, 'llms.txt'),
    renderLlms(await readFile(path.join(ROOT, 'public', 'llms.txt'), 'utf8'), products, whatsappNumber, categories),
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

export { attachProductApp, fetchProducts, injectShell, renderLlms, renderProductPage, renderShell, renderSitemap, toProduct, priceRange };
