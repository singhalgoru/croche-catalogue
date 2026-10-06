import { escapeHtml, getProductImageUrl, priceRange, renderSitemap, toProductSlug } from './prerender.mjs';
import storeContent from '../src/content/storeContent.json' with { type: 'json' };
import { collectionPath } from '../src/utils/collectionLink.js';
export { collectionPath };

const ORIGIN = 'https://luviacreations.com';
const descriptions = storeContent.collectionDescriptions;

const navigation = '<a href="/">Shop all</a><a href="/collections/">Collections</a><a href="/about/">About &amp; contact</a><a href="/faq/">Ordering FAQ</a>';
const page = (pathname, title, description, body, schema) => `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' https://images.luviacreations.com https://*.supabase.co https://*.r2.dev; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" />
<title>${escapeHtml(title)} | Luvia Creations</title><meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${ORIGIN}${pathname}"><link rel="icon" href="/images/favicon-96.png">
<meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)} | Luvia Creations">
<meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${ORIGIN}${pathname}">
<meta property="og:image" content="${ORIGIN}/images/luvia-logo.jpg">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(title)} | Luvia Creations">
<meta name="twitter:description" content="${escapeHtml(description)}">
<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>
<style>
*{box-sizing:border-box}body{margin:0;background:#fffaf0;color:#604239;font:16px/1.65 system-ui,sans-serif}
a{color:inherit;text-underline-offset:4px}a:hover{text-decoration-thickness:2px}a:focus-visible,summary:focus-visible{outline:3px solid #604239;outline-offset:4px}
header,main,footer{max-width:1120px;margin:auto;padding:24px}header{border-bottom:3px solid #edc357}.brand{display:flex;align-items:center;gap:12px;font-weight:700;text-decoration:none}.brand img{border-radius:50%}.skip{position:absolute;left:-10000px}.skip:focus{left:16px;top:8px;background:white;padding:8px}
nav{display:flex;flex-wrap:wrap;gap:12px 24px;margin-top:16px}.intro{max-width:760px}h1{font-size:clamp(1.7rem,4vw,2.6rem);line-height:1.2}h2{line-height:1.3}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:20px;list-style:none;padding:0}
.card,details{background:white;border:1px solid #edc357;border-radius:16px;padding:18px}.card h2{font-size:1.15rem}.card p{margin:8px 0}
.product-card{display:flex;flex-direction:column;overflow:hidden;padding:0;background:rgb(246 196 83 / .25);box-shadow:0 1px 2px rgb(0 0 0 / .05);transition:transform .2s,box-shadow .2s}.product-card:hover{transform:translateY(-2px);box-shadow:0 4px 6px rgb(0 0 0 / .1)}
.product-photo{display:block;position:relative;aspect-ratio:1;overflow:hidden;background:#fdf1d6}.product-photo img{position:relative;width:100%;height:100%;object-fit:contain}.product-photo .photo-backdrop{position:absolute;inset:0;object-fit:cover;transform:scale(1.1);opacity:.7;filter:blur(24px)}.product-copy{padding:16px}.product-copy h2{margin:0;font-weight:600}.product-copy a{text-decoration:none}.product-copy a:hover{text-decoration:underline}.product-price{font-weight:700}
.button{display:inline-block;background:#604239;color:white;padding:10px 18px;border-radius:24px;text-decoration:none;margin:8px 0}.note{font-size:.9rem}details{margin:12px 0}summary{cursor:pointer;font-weight:600}footer{border-top:1px solid #edc357;margin-top:32px}main{min-height:50vh}
</style></head><body><a class="skip" href="#main">Skip to content</a><header><a class="brand" href="/"><img src="/images/luvia-logo-320.webp" width="64" height="64" alt="">Luvia Creations</a><nav aria-label="Main navigation">${navigation}</nav></header>
<main id="main"><nav aria-label="Breadcrumb"><a href="/">Home</a><span aria-current="page">${escapeHtml(title)}</span></nav><h1>${escapeHtml(title)}</h1>${body}</main>
<footer><nav aria-label="Footer navigation">${navigation}<a href="/return-policy/">Return and refund policy</a></nav><p>Handmade crochet accessories, toys, gifts and decor, crafted with love in India.</p><p>Orders: <a href="mailto:orders@luviacreations.com">orders@luviacreations.com</a> · General enquiries: <a href="mailto:hello@luviacreations.com">hello@luviacreations.com</a></p></footer></body></html>`;

export const buildContentPages = (products, whatsappNumber, categories = []) => {
  const pages = new Map();
  const groups = new Map(categories.map(category => [category.name, []]));
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
    const description = Object.hasOwn(descriptions, category) ? descriptions[category]
      : `Explore ${category} from Luvia Creations. View handmade product designs and confirm details and availability before ordering.`;
    const cards = items.map((product, index) => {
      const range = priceRange(product);
      const price = range ? `${range.low !== range.high ? 'From ' : ''}₹${range.low.toLocaleString('en-IN')}` : 'Price on request';
      return `<li class="card product-card"><a class="product-photo" href="/p/${toProductSlug(product)}/" aria-label="View ${escapeHtml(product.name)}">
      ${product.image ? `<img class="photo-backdrop" src="${escapeHtml(getProductImageUrl(product.image, 480))}" width="480" height="480" alt="" aria-hidden="true" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async">
      <img src="${escapeHtml(getProductImageUrl(product.image, 480))}" width="480" height="480" alt="${escapeHtml(product.name)}" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async">` : ''}
      </a><div class="product-copy"><h2><a href="/p/${toProductSlug(product)}/">${escapeHtml(product.name)}</a></h2><p class="product-price">${price}</p>
      <p>View photos, product details and current availability.</p></div></li>`;
    }).join('');
    const schema = { ...baseSchema('CollectionPage', pathname, title, description), mainEntity: {
      '@type': 'ItemList', numberOfItems: items.length, itemListElement: items.map((product, index) => ({
        '@type': 'ListItem', position: index + 1, name: product.name, url: `${ORIGIN}/p/${toProductSlug(product)}/`,
      })),
    } };
    const collectionHtml = page(pathname, title, description, `<p class="intro">${escapeHtml(description)}</p>
      <p class="note">Prices shown are a catalogue snapshot and may vary by variant. Open a product for current price and availability; confirm shipping and dispatch before paying.</p>
      <p><a class="button" href="/?category=${encodeURIComponent(category)}">Shop ${escapeHtml(category)} with the cart</a></p>
      ${items.length ? `<ul class="grid">${cards}</ul>` : '<p>No published products in this collection yet.</p>'}
      <p>Need help choosing? <a href="${contact}">Ask us on WhatsApp</a> or read the <a href="/faq/">ordering FAQ</a>.</p>`, schema);
    pages.set(pathname, items.length ? collectionHtml
      : collectionHtml.replace('</head>', '<meta name="robots" content="noindex,follow"></head>'));
    if (items.length) collectionLinks.push(`<li class="card"><h2><a href="${pathname}">${escapeHtml(category)}</a></h2><p>${escapeHtml(description)}</p><p>${items.length} products</p></li>`);
  }
  const title = 'Explore our handmade collections';
  const description = 'Browse Luvia Creations collections of handmade crochet accessories, toys, gifts and decor. Explore product details and request orders across India.';
  pages.set('/collections/', page('/collections/', title, description,
    `<p class="intro">${description}</p><ul class="grid">${collectionLinks.join('')}</ul>`,
    baseSchema('CollectionPage', '/collections/', title, description)));
  const aboutTitle = 'About Luvia & contact';
  const aboutDescription = 'Discover Luvia Creations handmade crochet accessories, toys, gifts and decor. Contact us about products, customisation and orders shipped across India.';
  pages.set('/about/', page('/about/', aboutTitle, aboutDescription, `
    <section class="intro"><h2>Handmade crochet, made with love</h2><p>${escapeHtml(storeContent.about[0])}</p>
    <p>${escapeHtml(storeContent.about[1])}</p>
    <h2>Personal touches, confirmed with you</h2><p>${escapeHtml(storeContent.about[2])}</p>
    <h2>Contact Luvia</h2><p><a class="button" href="${contact}">Ask us on WhatsApp</a></p><p>WhatsApp / mobile: <a href="${contact}">+${escapeHtml(whatsappNumber)}</a></p>
    <p>Order enquiries: <a href="mailto:orders@luviacreations.com">orders@luviacreations.com</a><br>General enquiries: <a href="mailto:hello@luviacreations.com">hello@luviacreations.com</a></p>
    <p><a href="https://www.instagram.com/luvia.craftedwithlove/">Follow Luvia on Instagram</a></p>
    <h2>Ordering across India</h2><p>${escapeHtml(storeContent.about[3])}</p>
    <p>Read the <a href="/faq/">ordering FAQ</a> and <a href="/return-policy/">return and refund policy</a>.</p></section>`,
    baseSchema('AboutPage', '/about/', aboutTitle, aboutDescription)));
  const faqTitle = 'Ordering, delivery & care FAQ';
  const faqDescription = 'Answers to Luvia Creations ordering questions: WhatsApp confirmation, custom colours, payment, shipping across India, product care and returns.';
  const questions = storeContent.questions;
  const faqBody = questions.map(([question, answer]) => `<details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join('');
  pages.set('/faq/', page('/faq/', faqTitle, faqDescription, `<p class="intro">${faqDescription}</p>${faqBody}
    <details><summary>What is the return and refund policy?</summary><p>Please read our <a href="/return-policy/">return and refund policy</a> before ordering. Contact us about your specific order if you need clarification.</p></details>
    <p><a class="button" href="${contact}">Ask another question on WhatsApp</a></p>`,
    baseSchema('WebPage', '/faq/', faqTitle, faqDescription)));
  return pages;
};

export const renderContentSitemap = (products, today, pages) =>
  renderSitemap(products, today, [...pages].filter(([, html]) => !html.includes('<meta name="robots" content="noindex,follow">')).map(([pathname]) => pathname));
