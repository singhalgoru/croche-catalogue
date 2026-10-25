import { escapeHtml, getProductImageUrl, priceRange, renderSitemap, toProductSlug } from './prerender.mjs';
import storeContent from '../src/content/storeContent.json' with { type: 'json' };
import policies from '../src/content/policies.json' with { type: 'json' };
import bulkOrders from '../src/content/bulkOrders.json' with { type: 'json' };
import { collectionBreadcrumbList, collectionPath } from '../src/utils/collectionLink.js';
import { limitCategoryOverview } from '../src/utils/categoryOverview.js';
import { getCategoryHotspots, getCategoryImage } from '../src/utils/categoryImage.js';
import { getBestsellerProducts, getFeaturedProducts, productCollections } from '../src/utils/productCollections.js';
export { collectionPath };

const ORIGIN = 'https://luviacreations.com';
const descriptions = storeContent.collectionDescriptions;

const navigation = () => '<a href="/">Shop all</a><a href="/search/">Search products</a><a href="/collections/">Collections</a><a href="/bestsellers/">Bestsellers</a><a href="/featured/">Featured products</a><a href="/about/">About &amp; contact</a><a href="/faq/">Ordering FAQ</a><a href="/bulk-orders/">Bulk orders &amp; corporate gifting</a>'
  + policies.map(policy => `<a href="${policy.path}">${escapeHtml(policy.title)}</a>`).join('');
export const renderSiteHeader = () => `<a class="skip" href="#main">Skip to content</a><header><a class="brand" href="/"><img src="/images/luvia-logo-320.webp" width="64" height="64" alt="">Luvia Creations</a><nav aria-label="Main navigation">${navigation()}</nav></header>`;
export const renderSiteFooter = () => `<footer><nav aria-label="Footer navigation">${navigation()}<a href="/return-policy/">Return and refund policy</a></nav><p>Handmade crochet accessories, toys, gifts and decor, crafted with love in India.</p><p>Gurugram, Haryana, India</p><section aria-label="Payment methods"><div style="display:flex;flex-wrap:wrap;align-items:center;gap:24px"><span>We accept</span><img src="/images/payments/upi.svg" alt="UPI" width="68" height="24" loading="lazy"><img src="/images/payments/visa.svg" alt="Visa" width="64" height="27" loading="lazy"><img src="/images/payments/mastercard.svg" alt="Mastercard" width="58" height="36" loading="lazy"><img src="/images/payments/amex.png" alt="American Express" width="50" height="50" loading="lazy"><img src="/images/payments/rupay.svg" alt="RuPay" width="68" height="18" loading="lazy"><span style="display:inline-flex;align-items:center;gap:8px"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 8H5a2 2 0 0 1 0-4h13v4M3 6v13a2 2 0 0 0 2 2h15V8"/><path d="M20 12h-5a2 2 0 0 0 0 4h5z"/></svg>Wallet</span></div><p class="note">Secure payments via Razorpay. Available payment methods are shown at checkout.</p></section><p>Orders: <a href="mailto:orders@luviacreations.com">orders@luviacreations.com</a> · General enquiries: <a href="mailto:hello@luviacreations.com">hello@luviacreations.com</a></p></footer>`;
const page = (pathname, title, description, body, schema, socialImage = `${ORIGIN}/images/luvia-logo.jpg`) => `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' https://images.luviacreations.com https://*.supabase.co https://*.r2.dev; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" />
<title>${escapeHtml(title)} | Luvia Creations</title><meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${ORIGIN}${pathname}"><link rel="icon" href="/images/favicon-96.png">
<meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)} | Luvia Creations">
<meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${ORIGIN}${pathname}">
<meta property="og:image" content="${escapeHtml(socialImage)}">
<meta name="twitter:image" content="${escapeHtml(socialImage)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)} | Luvia Creations">
<meta name="twitter:description" content="${escapeHtml(description)}">
<script type="application/ld+json">${JSON.stringify({ ...schema, ...(pathname.startsWith('/collections/') ? { breadcrumb: collectionBreadcrumbList(pathname, title, ORIGIN) } : {}) }).replace(/</g, '\\u003c')}</script>
<style>
*{box-sizing:border-box}body{margin:0;background:#fffaf0;color:#604239;font:16px/1.65 system-ui,sans-serif}
.hotspot-links{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.hotspot-links:focus-within{position:static;width:auto;height:auto;margin:0;overflow:visible;clip-path:none;white-space:normal}
a{color:inherit;text-underline-offset:4px}a:hover{text-decoration-thickness:2px}a:focus-visible,summary:focus-visible{outline:3px solid #604239;outline-offset:4px}
header,main,footer{max-width:1120px;margin:auto;padding:24px}header{border-bottom:3px solid #edc357}.brand{display:flex;align-items:center;gap:12px;font-weight:700;text-decoration:none}.brand img{border-radius:50%}.skip{position:absolute;left:-10000px}.skip:focus{left:16px;top:8px;background:white;padding:8px}
nav{display:flex;flex-wrap:wrap;gap:12px 24px;margin-top:16px}.intro{max-width:760px}h1{font-size:clamp(1.7rem,4vw,2.6rem);line-height:1.2}h2{line-height:1.3}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:20px;list-style:none;padding:0}
.card,details{background:white;border:1px solid #edc357;border-radius:16px;padding:18px}.card h2{font-size:1.15rem}.card p{margin:8px 0}
.product-card{display:flex;flex-direction:column;overflow:hidden;padding:0;background:rgb(246 196 83 / .25);box-shadow:0 1px 2px rgb(0 0 0 / .05);transition:transform .2s,box-shadow .2s}.product-card:hover{transform:translateY(-2px);box-shadow:0 4px 6px rgb(0 0 0 / .1)}
.product-photo{display:block;position:relative;aspect-ratio:1;overflow:hidden;background:#fdf1d6}.product-photo img{position:relative;width:100%;height:100%;object-fit:contain}.product-photo .photo-backdrop{position:absolute;inset:0;object-fit:cover;transform:scale(1.1);opacity:.7;filter:blur(24px)}.product-copy{padding:16px}.product-copy h2{margin:0;font-weight:600}.product-copy a{text-decoration:none}.product-copy a:hover{text-decoration:underline}.product-price{font-weight:700}
.collection-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.collection-tile{display:block;height:100%;color:inherit;text-decoration:none}.collection-tile:hover h2{text-decoration:underline}.collection-photo{position:relative;display:block;aspect-ratio:1;overflow:hidden;background:#fdf1d6}.collection-photo img{position:relative;width:100%;height:100%;object-fit:contain}.collection-photo .photo-backdrop{position:absolute;inset:0;object-fit:cover;transform:scale(1.1);opacity:.7;filter:blur(24px)}@media(min-width:640px){.collection-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(min-width:1024px){.collection-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
.button{display:inline-block;background:#604239;color:white;padding:10px 18px;border-radius:24px;text-decoration:none;margin:8px 0}.note{font-size:.9rem}details{margin:12px 0}summary{cursor:pointer;font-weight:600}footer{border-top:1px solid #edc357;margin-top:32px}main{min-height:50vh}
</style></head><body>${renderSiteHeader()}
<main id="main"><nav aria-label="Breadcrumb"><a href="/">Home</a>${pathname.startsWith('/collections/') && pathname !== '/collections/' ? '<a href="/collections/">Collections</a>' : ''}<span aria-current="page">${escapeHtml(title)}</span></nav><h1>${escapeHtml(title)}</h1>${body}</main>
${renderSiteFooter()}</body></html>`;

const productCards = items => items.map((product, index) => {
  const range = priceRange(product);
  const price = range ? `${range.low !== range.high ? 'From ' : ''}₹${range.low.toLocaleString('en-IN')}` : 'Price on request';
  return `<li class="card product-card" style="position:relative"><a class="product-photo" href="/p/${toProductSlug(product)}/" aria-label="View ${escapeHtml(product.name)}">
  ${product.image ? `<img class="photo-backdrop" src="${escapeHtml(getProductImageUrl(product.image, 480))}" width="480" height="480" alt="" aria-hidden="true" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async">
  <img src="${escapeHtml(getProductImageUrl(product.image, 480))}" width="480" height="480" alt="${escapeHtml(product.name)}" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async">` : ''}
  </a>${product.makingVideo ? `<a href="/p/${toProductSlug(product)}/?watch=making-video#making-video" aria-label="Watch making video for ${escapeHtml(product.name)}" title="Watch making video" style="position:absolute;top:8px;right:8px;display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;border:1px solid #60423933;background:#fffaf0f2;color:#604239;box-shadow:0 1px 2px #0002"><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5.5a1 1 0 0 1 1.5-.86l10 6.5a1 1 0 0 1 0 1.72l-10 6.5A1 1 0 0 1 8 18.5z"/></svg></a>` : ''}<div class="product-copy"><h2><a href="/p/${toProductSlug(product)}/">${escapeHtml(product.name)}</a></h2><p class="product-price">${price}</p>
  <p>View photos, product details and current availability.</p>
  <a class="button" href="/p/${toProductSlug(product)}/">Choose options &amp; add to cart</a>
  <a class="button" href="https://wa.me/?text=${encodeURIComponent(`${product.name} — ${ORIGIN}/p/${toProductSlug(product)}/`)}" aria-label="Share ${escapeHtml(product.name)}">Share</a></div></li>`;
}).join('');

export const buildContentPages = (products, whatsappNumber, categories = [], bestsellerIds = []) => {
  const pages = new Map();
  const orderedCategories = [...categories].sort((a, b) => Number(Boolean(b.isSeasonal)) - Number(Boolean(a.isSeasonal)) || a.priority - b.priority);
  const groups = new Map(orderedCategories.filter(category => category.visible !== false).map(category => [
    category.name, category.isSeasonal ? products.filter(product => category.productIds?.includes(product.id)) : [],
  ]));
  for (const product of products) {
    const current = groups.get(product.category) ?? [];
    current.push(product);
    groups.set(product.category, current);
  }
  const contact = `https://wa.me/${encodeURIComponent(whatsappNumber)}?text=${encodeURIComponent('Hi Luvia, I would like to ask about your crochet products.')}`;
  const baseSchema = (type, pathname, name, description) => ({
    '@context': 'https://schema.org', '@type': type, name, description, url: `${ORIGIN}${pathname}`,
    isPartOf: { '@type': 'WebSite', name: 'Luvia Creations', url: `${ORIGIN}/` },
  });
  const collectionLinks = [];
  for (const [category, items] of groups) {
    const pathname = collectionPath(category);
    if (pages.has(pathname)) throw new Error(`Duplicate collection path: ${category}`);
    const title = `Handmade ${category}`;
    const settings = categories.find(item => item.name === category);
    const coverImage = settings?.coverImage;
    const categoryImage = getCategoryImage(items, settings);
    const socialImage = categoryImage ? getProductImageUrl(categoryImage, 1080) : undefined;
    const hotspots = getCategoryHotspots(items, settings);
    const look = coverImage && hotspots.length ? `<section aria-label="Shop the look: ${escapeHtml(category)}">
      <h2>Shop this look</h2><p>Explore the small rings in this collection photo.</p>
      <div style="position:relative;max-width:760px">
        <img src="${escapeHtml(getProductImageUrl(coverImage, 1080))}" alt="${escapeHtml(category)} styled collection" style="display:block;width:100%;height:auto">
        ${hotspots.map(spot => `<a href="/p/${toProductSlug(spot.product)}/" aria-label="View ${escapeHtml(spot.product.name)}"
          style="position:absolute;left:${spot.x}%;top:${spot.y}%;transform:translate(-50%,-50%);width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center"><span aria-hidden="true" style="width:10px;height:10px;border-radius:50%;background:transparent;border:1.5px solid white;box-shadow:0 0 0 1px #60423999"></span></a>`).join('')}
      </div><ol class="hotspot-links" aria-label="Products in this look">${hotspots.map(spot => `<li><a href="/p/${toProductSlug(spot.product)}/">${escapeHtml(spot.product.name)}</a></li>`).join('')}</ol>
      </section>` : '';
    const description = limitCategoryOverview(categories.find(item => item.name === category)?.overview || (Object.hasOwn(descriptions, category) ? descriptions[category]
      : `Explore ${category} from Luvia Creations. View handmade product designs and confirm details and availability before ordering.`));
    const cards = productCards(items);
    const schema = { ...baseSchema('CollectionPage', pathname, title, description), mainEntity: {
      '@type': 'ItemList', numberOfItems: items.length, itemListElement: items.map((product, index) => ({
        '@type': 'ListItem', position: index + 1, name: product.name, url: `${ORIGIN}/p/${toProductSlug(product)}/`,
      })),
    } };
    const collectionHtml = page(pathname, title, description, `<p class="intro">${escapeHtml(description)}</p>
      ${look}
      <p class="note">Prices shown are a catalogue snapshot and may vary by variant. Open a product for current price and availability; confirm shipping and dispatch before paying.</p>
      ${items.length ? `<ul class="grid">${cards}</ul>` : '<p>No published products in this collection yet.</p>'}
      <p>Need help choosing? <a href="${contact}">Ask us on WhatsApp</a> or read the <a href="/faq/">ordering FAQ</a>.</p>`, schema, socialImage);
    pages.set(pathname, items.length ? collectionHtml
      : collectionHtml.replace('</head>', '<meta name="robots" content="noindex,follow"></head>'));
    if (items.length) {
      const image = categoryImage;
      const src = image ? getProductImageUrl(image, 480) : '/images/luvia-logo-320.webp';
      collectionLinks.push(`<li class="card product-card"><a class="collection-tile" href="${pathname}" aria-label="${escapeHtml(category)}">
        <span class="collection-photo">${image ? `<img class="photo-backdrop" src="${escapeHtml(src)}" alt="" aria-hidden="true" width="480" height="480" loading="lazy" decoding="async">` : ''}
        <img src="${escapeHtml(src)}" alt="" width="480" height="480" loading="lazy" decoding="async"></span>
        <div class="product-copy"><h2>${escapeHtml(category)}</h2><p>${items.length} ${items.length === 1 ? 'product' : 'products'}</p></div></a></li>`);
    }
  }
  for (const collection of productCollections) {
    const { path: pathname, title, description, empty } = collection;
    const items = pathname === '/bestsellers/' ? getBestsellerProducts(products, bestsellerIds) : getFeaturedProducts(products);
    pages.set(pathname, page(pathname, title, description,
      `<p class="intro">${escapeHtml(description)}</p>${items.length ? `<ul class="grid">${productCards(items)}</ul>` : `<p>${escapeHtml(empty)}</p>`}
      <p class="note">Prices and availability are a catalogue snapshot. Open a product for current details.</p>`,
      { ...baseSchema('CollectionPage', pathname, title, description),
        breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: title, item: `${ORIGIN}${pathname}` },
        ] },
        mainEntity: { '@type': 'ItemList', numberOfItems: items.length, itemListElement: items.map((product, index) => ({
          '@type': 'ListItem', position: index + 1, name: product.name, url: `${ORIGIN}/p/${toProductSlug(product)}/`,
        })) },
      }));
  }
  const title = 'Explore our handmade collections';
  const description = 'Browse Luvia Creations collections of handmade crochet accessories, toys, gifts and decor. Explore product details and request orders across India.';
  pages.set('/collections/', page('/collections/', title, description,
    `<p class="intro">Find your favourites by collection, then open a product for photos and details.</p><a class="button" href="/">Shop all products</a>
    <nav aria-label="Explore collections"><ul class="grid collection-grid">${collectionLinks.join('')}</ul></nav>`,
    baseSchema('CollectionPage', '/collections/', title, description)));
  const story = storeContent.brandStory;
  pages.set('/search/', page('/search/', 'Search products', 'Search Luvia Creations handmade crochet products by name, category, description or colour.',
    '<form role="search" action="/search/" method="get"><label for="product-search">Search products</label><input id="product-search" name="q" type="search" placeholder="Try keychain, gajra or bunny"><button type="submit">Search</button></form><p>Enable JavaScript for search results, or <a href="/collections/">browse our collections</a>.</p>',
    baseSchema('WebPage', '/search/', 'Search products', 'Find handmade crochet products.'))
    .replace("form-action 'none'", "form-action 'self'").replace('</head>', '<meta name="robots" content="noindex,follow"></head>'));
  const aboutTitle = story.title;
  const aboutDescription = story.description;
  pages.set('/about/', page('/about/', aboutTitle, aboutDescription, `
    <section class="intro"><article aria-label="Luvia's founder story" class="card">
    <p><strong>${escapeHtml(story.subtitle)}</strong></p><p>${escapeHtml(story.intro)}</p>
    ${story.sections.map(section => `<section><h2>${escapeHtml(section.title)}</h2>${section.paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}</section>`).join('')}
    <section aria-labelledby="founder-note-title" class="card"><h2 id="founder-note-title">${escapeHtml(story.founderNote.title)}</h2>
    <p>${escapeHtml(story.founderNote.text)}</p><p><strong>${escapeHtml(story.founderNote.signature)}</strong><br>${escapeHtml(story.founderNote.role)}</p></section>
    <p><strong>${escapeHtml(story.closing)}</strong></p><a class="button" href="/collections/">${escapeHtml(story.shopLabel)}</a></article>
    <h2>Thoughtfully crafted crochet, made to be treasured</h2><p>${escapeHtml(storeContent.about[0])}</p>
    <p>${escapeHtml(storeContent.about[1])}</p>
    <h2>Personal touches, confirmed with you</h2><p>${escapeHtml(storeContent.about[2])}</p>
    <h2>Contact Luvia</h2><p>Luvia Creations<br>Gurugram, Haryana, India</p><p><a class="button" href="${contact}">Ask us on WhatsApp</a></p><p>WhatsApp / mobile: <a href="${contact}">+${escapeHtml(whatsappNumber)}</a></p>
    <p>Order enquiries: <a href="mailto:orders@luviacreations.com">orders@luviacreations.com</a><br>General enquiries: <a href="mailto:hello@luviacreations.com">hello@luviacreations.com</a></p>
    <p><a href="https://www.instagram.com/luvia.craftedwithlove/">Follow Luvia on Instagram</a></p>
    <h2>Ordering across India</h2><p>${escapeHtml(storeContent.about[3])}</p>
    <p>${escapeHtml(storeContent.dispatch)}</p><p>${escapeHtml(storeContent.shipping)}</p>
    <h2>${escapeHtml(storeContent.orderingDisclosure.title)}</h2>
    <p>${escapeHtml(storeContent.orderingDisclosure.request)}</p>
    <p>${escapeHtml(storeContent.orderingDisclosure.price)}</p>
    <p>${escapeHtml(storeContent.orderingDisclosure.payment)}</p>
    <p>Read the <a href="/faq/">ordering FAQ</a> and <a href="/return-policy/">return and refund policy</a>.</p></section>`,
    baseSchema('AboutPage', '/about/', aboutTitle, aboutDescription)));
  const faqTitle = 'Ordering, delivery & care FAQ';
  const faqDescription = 'Answers to Luvia Creations ordering questions: secure Razorpay checkout, custom colours, shipping across India, product care and returns.';
  const questions = storeContent.questions;
  const faqBody = questions.map(([question, answer]) => `<details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join('');
  pages.set('/faq/', page('/faq/', faqTitle, faqDescription, `<p class="intro">${faqDescription}</p>${faqBody}
    <details><summary>What is the return and refund policy?</summary><p>Please read our <a href="/return-policy/">return and refund policy</a> before ordering. Contact us about your specific order if you need clarification.</p></details>
    <p><a class="button" href="${contact}">Ask another question on WhatsApp</a></p>`,
    baseSchema('WebPage', '/faq/', faqTitle, faqDescription)));
  for (const policy of policies) {
    const body = `<p class="note">Last updated: ${escapeHtml(policy.updated)}</p>`
      + policy.sections.map(section => `<section><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.text)}</p></section>`).join('')
      + '<p><a href="/return-policy/">Return and refund policy</a> · <a href="/about/">About &amp; contact</a></p>';
    pages.set(policy.path, page(policy.path, policy.title, policy.description, body,
      baseSchema('WebPage', policy.path, policy.title, policy.description)));
  }
  pages.set(bulkOrders.path, page(bulkOrders.path, bulkOrders.title, bulkOrders.description, `
    <section class="intro"><h2>Handmade gifts for teams, clients &amp; celebrations</h2>
    <p>${escapeHtml(bulkOrders.description)}</p>
    <p>Share your quantity, budget, occasion and required delivery date to help us plan your enquiry.</p>
    <p><a class="button" href="mailto:${bulkOrders.email}?subject=${encodeURIComponent(bulkOrders.subject)}&amp;body=${encodeURIComponent(bulkOrders.message)}">Email for bulk orders</a>
    <a class="button" href="https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(bulkOrders.message)}">Enquire on WhatsApp</a></p>
    <p>${escapeHtml(bulkOrders.email)}</p><p class="note">${escapeHtml(bulkOrders.note)}</p>
    <p class="note">With JavaScript enabled, use our enquiry form to prepare a personalised email draft. Review and send it from your email app; preparing a draft does not send it automatically.</p></section>`,
    baseSchema('WebPage', bulkOrders.path, bulkOrders.title, bulkOrders.description)));
  return pages;
};

export const renderContentSitemap = (products, today, pages, categories = []) =>
  renderSitemap(products, today, [...pages]
    .filter(([, html]) => !html.includes('<meta name="robots" content="noindex,follow">'))
    .map(([pathname]) => {
      const category = categories.find(settings => collectionPath(settings.name) === pathname);
      const items = products.filter(product => category?.isSeasonal
        ? category.productIds?.includes(product.id) : collectionPath(product.category) === pathname);
      const image = getProductImageUrl(getCategoryImage(items, category), 960);
      return { pathname, images: /^https:\/\//.test(image) ? [image] : [] };
    }));
