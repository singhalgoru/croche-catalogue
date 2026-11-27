import { escapeHtml, getProductImageUrl, priceRange, renderSitemap, toProductSlug } from './prerender.mjs';
import storeContent from '../src/content/storeContent.json' with { type: 'json' };
import policies from '../src/content/policies.json' with { type: 'json' };
import bulkOrders from '../src/content/bulkOrders.json' with { type: 'json' };
import artisanOnboarding from '../src/content/artisanOnboarding.json' with { type: 'json' };
import internationalQuote from '../src/content/internationalQuote.json' with { type: 'json' };
import contentArticles from '../src/content/contentArticles.json' with { type: 'json' };
import { collectionBreadcrumbList, collectionPath } from '../src/utils/collectionLink.js';
import { limitCategoryOverview } from '../src/utils/categoryOverview.js';
import { getCategoryHotspots, getCategoryImage } from '../src/utils/categoryImage.js';
import { getBestsellerProducts, getFeaturedProducts, productCollections } from '../src/utils/productCollections.js';
import { publicContentPages } from './public-discovery.mjs';
import { testimonialPath } from '../src/utils/testimonialLink.js';
import { getBoundedMetaTitle } from '../src/utils/productMetaTitle.js';
import { getBoundedMetaDescription } from '../src/utils/metaDescription.js';
import { instagramPageTitle, instagramPageDescription, instagramPageIntro, instagramCaptionSummary } from '../src/utils/instagramContent.js';
export { collectionPath };

const ORIGIN = 'https://luviacreations.com';
const descriptions = storeContent.collectionDescriptions;

const navigation = () => '<a href="/">Shop all</a><a href="/search/">Search products</a><a href="/collections/">Collections</a><a href="/bestsellers/">Bestsellers</a><a href="/featured/">Featured products</a><a href="/crochet-gift-guide/">Crochet gift guide</a><a href="/customer-love/">Customer Love</a><a href="/from-instagram/">From Instagram</a><a href="/about/">About &amp; contact</a><a href="/faq/">Ordering FAQ</a><a href="/bulk-orders/">Bulk orders &amp; corporate gifting</a>'
  + `<a href="${internationalQuote.path}">International quotes</a>`
  + policies.map(policy => `<a href="${policy.path}">${escapeHtml(policy.title)}</a>`).join('');
export const renderSiteHeader = () => `<a class="skip" href="#main">Skip to content</a><header><a class="brand" href="/"><img src="/images/luvia-logo-160.webp" width="48" height="48" alt="">Luvia Creations</a><nav aria-label="Main navigation">${navigation()}</nav></header>`;
const renderMobileNavigation = pathname => `<nav class="static-mobile-navigation" aria-label="Mobile navigation"><a href="/">Home</a><a href="/collections/"${pathname.startsWith('/collections/') ? ' aria-current="page"' : ''}>Collections</a><a href="/?checkout=cart">Cart</a><a href="/?account=orders">Account</a><a href="#store-links">More</a></nav>`;
export const renderSiteFooter = () => `<footer><nav aria-label="Footer navigation">${navigation()}</nav><p>Handmade crochet accessories, toys, gifts and decor, crafted with love in India.</p><p>Gurugram, Haryana, India</p><section aria-label="Payment methods"><div style="display:flex;flex-wrap:wrap;align-items:center;gap:24px"><span>We accept</span><img src="/images/payments/upi.svg" alt="UPI" width="68" height="24" loading="lazy"><img src="/images/payments/visa.svg" alt="Visa" width="64" height="27" loading="lazy"><img src="/images/payments/mastercard.svg" alt="Mastercard" width="58" height="36" loading="lazy"><img src="/images/payments/amex.png" alt="American Express" width="50" height="50" loading="lazy"><img src="/images/payments/rupay.svg" alt="RuPay" width="68" height="18" loading="lazy"><span style="display:inline-flex;align-items:center;gap:8px"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 8H5a2 2 0 0 1 0-4h13v4M3 6v13a2 2 0 0 0 2 2h15V8"/><path d="M20 12h-5a2 2 0 0 0 0 4h5z"/></svg>Wallet</span></div><p class="note">Secure payments via Razorpay. Available payment methods are shown at checkout.</p></section><p>Orders: <a href="mailto:orders@luviacreations.com">orders@luviacreations.com</a> · General enquiries: <a href="mailto:hello@luviacreations.com">hello@luviacreations.com</a></p></footer>`;
const page = (pathname, title, description, body, schema, socialImage = `${ORIGIN}/images/luvia-logo.jpg`) => {
  const metaTitle = getBoundedMetaTitle(title);
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' https://images.luviacreations.com https://*.supabase.co https://*.r2.dev; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" />
<title>${escapeHtml(metaTitle)}</title><meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${ORIGIN}${pathname}"><link rel="icon" href="/images/favicon-96.png">
<meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(metaTitle)}">
<meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${ORIGIN}${pathname}">
<meta property="og:image" content="${escapeHtml(socialImage)}">
<meta name="twitter:image" content="${escapeHtml(socialImage)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(metaTitle)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<script type="application/ld+json">${JSON.stringify({ ...schema, ...(pathname.startsWith('/collections/') ? { breadcrumb: collectionBreadcrumbList(pathname, title, ORIGIN) } : {}) }).replace(/</g, '\\u003c')}</script>
<style>
*{box-sizing:border-box}body{margin:0;background:#fffaf0;color:#604239;font:16px/1.65 system-ui,sans-serif}
img,video{pointer-events:none;-webkit-user-drag:none;-webkit-touch-callout:none;user-select:none}
.hotspot-links{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.hotspot-links:focus-within{position:static;width:auto;height:auto;margin:0;overflow:visible;clip-path:none;white-space:normal}
a{color:inherit;text-underline-offset:4px}a:hover{text-decoration-thickness:2px}a:focus-visible,summary:focus-visible{outline:3px solid #604239;outline-offset:4px}
header,main,footer{max-width:1120px;margin:auto;padding:24px}header{border-bottom:3px solid #edc357}.brand{display:flex;align-items:center;gap:12px;font-weight:700;text-decoration:none}.brand img{border-radius:50%}.skip{position:absolute;left:-10000px}.skip:focus{left:16px;top:8px;background:white;padding:8px}
nav{display:flex;flex-wrap:wrap;gap:12px 24px;margin-top:16px}.intro{max-width:760px}h1{font-size:clamp(1.7rem,4vw,2.6rem);line-height:1.2}h2{line-height:1.3}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:20px;list-style:none;padding:0}
.instagram-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.instagram-grid .card{min-width:0;padding:12px;overflow-wrap:anywhere}@media(min-width:640px){.instagram-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}}@media(min-width:1024px){.instagram-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
.instagram-grid details{margin:8px 0;padding:0;border:0;border-radius:0}.instagram-grid summary{min-height:44px}.instagram-grid details p{white-space:pre-line}.instagram-grid .card>a:not(:first-child),.instagram-grid .card p>a{display:inline-flex;align-items:center;min-height:44px}
.card,details{background:white;border:1px solid #edc357;border-radius:16px;padding:18px}.card h2{font-size:1.15rem}.card p{margin:8px 0}
.product-card{display:flex;flex-direction:column;overflow:hidden;padding:0;background:rgb(246 196 83 / .25);box-shadow:0 1px 2px rgb(0 0 0 / .05);transition:transform .2s,box-shadow .2s}.product-card:hover{transform:translateY(-2px);box-shadow:0 4px 6px rgb(0 0 0 / .1)}
.product-photo{display:block;position:relative;aspect-ratio:1;overflow:hidden;background:#fdf1d6}.product-photo img{position:relative;width:100%;height:100%;object-fit:contain}.product-photo .photo-backdrop{position:absolute;inset:0;object-fit:cover;transform:scale(1.1);opacity:.7;filter:blur(24px)}.product-copy{padding:16px}.product-copy h2{margin:0;font-weight:600}.product-copy a{text-decoration:none}.product-copy a:hover{text-decoration:underline}.product-price{font-weight:700}
.collection-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.collection-tile{display:block;height:100%;color:inherit;text-decoration:none}.collection-tile:hover h2{text-decoration:underline}.collection-photo{position:relative;display:block;aspect-ratio:1;overflow:hidden;background:#fdf1d6}.collection-photo img{position:relative;width:100%;height:100%;object-fit:contain}.collection-photo .photo-backdrop{position:absolute;inset:0;object-fit:cover;transform:scale(1.1);opacity:.7;filter:blur(24px)}@media(min-width:640px){.collection-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(min-width:1024px){.collection-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
.button{display:inline-block;background:#604239;color:white;padding:10px 18px;border-radius:24px;text-decoration:none;margin:8px 0}.note{font-size:.9rem}details{margin:12px 0}summary{cursor:pointer;font-weight:600}footer{border-top:1px solid #edc357;margin-top:32px}main{min-height:50vh}
.about-contact{overflow:hidden;margin-top:24px;border:1px solid #edc35788;border-radius:16px;background:#fffaf0}.about-contact-intro,.about-contact-links{padding:20px}.about-contact-intro h2{scroll-margin-top:96px;margin:8px 0 0}.about-contact-intro>p{margin:4px 0}.about-contact-intro .button{display:block;text-align:center;margin:20px 0 0;font-weight:700}.about-contact-intro .contact-number{text-align:center;font-size:.875rem}.about-contact-links{border-top:1px solid #60423922;background:#ffffffb3}.about-contact-links p{margin:0 0 12px;font-size:.875rem}.about-contact-links a{display:inline-flex;align-items:center;min-height:44px;overflow-wrap:anywhere}.about-contact-links .contact-help{border-top:1px solid #60423922;padding-top:8px;margin-bottom:0}
.about-collections{margin-top:32px}.about-collections>p{font-size:.875rem}.about-collections ul{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;list-style:none;padding:0}.about-collections li{min-width:0}.about-collections li a{display:flex;align-items:center;gap:8px;min-height:80px;padding:12px;border:1px solid #edc35788;border-radius:16px;background:#ffffffb3;text-decoration:none}.about-collections li a:hover strong{text-decoration:underline}.about-collections li img{width:40px;height:40px;flex-shrink:0;border-radius:12px;background:#fdf1d6;object-fit:contain}.about-collections li div{min-width:0}.about-collections li strong{font-size:.875rem}.about-collections li span{display:block;font-size:.75rem}.about-collections li .collection-arrow{display:none;margin-left:auto;flex-shrink:0}.about-collections>a{display:inline-flex;align-items:center;min-height:44px;font-weight:700;font-size:.875rem}@media(min-width:640px){.about-collections ul{grid-template-columns:repeat(3,minmax(0,1fr))}.about-collections li a{gap:12px}.about-collections li img{width:64px;height:64px}.about-collections li strong{font-size:1rem}.about-collections li .collection-arrow{display:block}}@media(min-width:1024px){.about-collections ul{grid-template-columns:repeat(4,minmax(0,1fr))}}
.budget-intro{padding:24px;border:1px solid #edc35766;border-radius:24px;background:#edc35719}.budget-eyebrow{font-size:.75rem;text-transform:uppercase;letter-spacing:.1em}.budget-picker{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.budget-picker a{padding:12px;border:1px solid #60423922;border-radius:16px;background:white;text-decoration:none}.budget-picker span,.budget-picker strong{display:block}.budget-picker strong{font-size:clamp(1.2rem,4vw,2rem)}.budget-picker span{font-size:.75rem}
.budget-band{scroll-margin-top:96px;margin:40px 0}.budget-band h2{margin-bottom:8px}.budget-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;list-style:none;padding:0}.budget-card{min-width:0;overflow:hidden;border:1px solid #60423922;border-radius:16px;background:white}.budget-card .product-copy{padding:12px}.budget-card h3{margin:8px 0;font-size:1rem;line-height:1.4}.budget-card h3 a{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.8em}.budget-card p{margin:8px 0}.budget-card .budget-category{font-size:.65rem;text-transform:uppercase;letter-spacing:.05em}.budget-card .product-price{font-size:1.15rem}.budget-card .note{font-size:.75rem}.budget-band details{padding:0;border:0;background:transparent}.budget-band summary{width:fit-content;margin:auto;padding:12px 20px;border:1px solid #60423944;border-radius:28px;text-align:center;font-size:.875rem}
.budget-help{display:grid;gap:20px;padding:24px;background:#604239;color:#fffaf0;border-radius:24px}.budget-help h2{font-size:1.25rem}.budget-help a{display:inline-flex;align-items:center;min-height:44px}.budget-help p{font-size:.875rem}.budget-help>div+div{border-top:1px solid #fffaf033;padding-top:16px}@media(min-width:640px){.budget-help{grid-template-columns:repeat(2,minmax(0,1fr))}.budget-help>div+div{border-top:0;border-left:1px solid #fffaf033;padding:0 0 0 24px}}@media(min-width:1024px){.budget-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}}
.budget-purchase{display:flex;align-items:center;justify-content:space-between;gap:4px;min-height:44px}.budget-purchase .product-price{min-width:0;font-size:1rem}.budget-cart{display:flex;align-items:center;justify-content:center;flex-shrink:0;width:44px;height:44px;border-radius:50%;background:#604239;color:white}
.gift-guide>section,.gift-guide>nav,.gift-steps{margin-bottom:32px}.gift-hero h2{font-size:clamp(1.5rem,4vw,2rem)}.gift-hero ol{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0}.gift-hero li{padding:8px 12px;border:1px solid #60423922;border-radius:24px;background:white;font-size:.75rem;font-weight:600}.gift-start,.gift-steps{display:grid;gap:20px}.gift-start>a,.gift-step{padding:24px;border:1px solid #60423922;border-radius:16px;background:white}.gift-start>a{text-decoration:none;border-color:#edc35788}.gift-start strong{display:block;font-size:1.25rem}.gift-start a:hover strong{text-decoration:underline}.gift-start span{display:block;margin:0 0 12px}.gift-step{display:flex;flex-direction:column;align-items:flex-start}.gift-step h2{font-size:1.25rem;margin:0}.gift-step>p:not(.budget-eyebrow){font-size:.875rem}.gift-step>a{display:inline-flex;align-items:center;min-height:44px;margin-top:auto;font-size:.875rem;font-weight:600}.gift-step:last-child{background:#604239;color:#fffaf0}.gift-ordering{justify-content:space-between;padding:16px;border:1px solid #60423922;border-radius:16px;font-size:.875rem}.gift-ordering a{display:inline-flex;align-items:center;min-height:44px}@media(min-width:640px){.gift-start,.gift-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.gift-step:last-child{grid-column:span 2}}
.styling-guide>section,.styling-guide>nav{margin-bottom:32px}.styling-hero{display:grid;overflow:hidden;border:1px solid #edc35766;border-radius:24px;background:#edc35719}.styling-intro{display:flex;flex-direction:column;justify-content:center;padding:24px}.styling-intro h2{font-size:clamp(1.5rem,4vw,2rem);margin:8px 0}.styling-hero figure{margin:0;aspect-ratio:4/3;overflow:hidden}.styling-hero img{display:block;width:100%;height:100%;object-fit:cover}.styling-step{display:grid;gap:16px;border:1px solid #60423922;border-radius:24px;padding:24px;background:white}.styling-step h2{font-size:1.5rem;margin-top:8px}.styling-step .styling-copy{font-size:.875rem}.styling-step nav{gap:8px}.styling-step nav a{display:inline-flex;align-items:center;min-height:44px;border:1px solid #60423933;border-radius:24px;padding:8px 16px;font-weight:600;text-decoration:none}.styling-step nav a:hover{background:#edc35719}.article-related{padding:20px;border:1px solid #edc35766;border-radius:16px;background:#edc35719;font-size:.875rem}.article-related a{display:inline-flex;align-items:center;min-height:44px}@media(min-width:768px){.styling-hero.has-photo{grid-template-columns:repeat(2,minmax(0,1fr))}.styling-hero figure{aspect-ratio:1}.styling-step{grid-template-columns:.7fr 1.3fr}}
.policy-layout{display:grid;align-items:start;gap:24px;margin-top:24px}.policy-toc,.policy-section{padding:24px;border:1px solid #60423922;border-radius:16px;background:white}.policy-toc{display:block;margin:0;padding:16px}.policy-toc h2{font-size:1.125rem;margin:0 0 8px}.policy-toc a{display:flex;align-items:center;min-height:44px;padding:8px 0;font-size:.875rem;text-decoration:none;line-height:1.4}.policy-toc a:hover{text-decoration:underline}.policy-section{scroll-margin-top:96px;margin-bottom:16px}.policy-section h2{font-size:1.25rem;margin-top:0}.policy-section p{font-size:.875rem}.policy-updated{font-size:.75rem}@media(min-width:1024px){.policy-layout{grid-template-columns:240px minmax(0,1fr)}.policy-toc{position:sticky;top:96px}}
.faq-topics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:24px}.faq-topics a{padding:16px;border:1px solid #60423922;border-radius:16px;background:white;text-decoration:none}.faq-topics strong,.faq-topics span{display:block}.faq-topics strong{font-size:1.125rem}.faq-topics span{margin-top:8px;font-size:.75rem}.faq-group{display:grid;gap:16px;scroll-margin-top:96px;margin:40px 0}.faq-group h2{font-size:1.5rem;margin:0}.faq-group>div>p{font-size:.875rem}.faq-answers details{scroll-margin-top:96px;border-color:#60423922;padding:0 20px}.faq-answers summary{padding:16px 0}.faq-answers details p{margin:0;padding:0 0 20px;font-size:.875rem}.faq-help{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px;padding:24px;border-radius:24px;background:#604239;color:#fffaf0}.faq-help h2{font-size:1.25rem}.faq-help p{max-width:560px;font-size:.875rem}.faq-help a{display:inline-flex;align-items:center;min-height:44px;font-size:.875rem}@media(min-width:768px){.faq-group{grid-template-columns:.7fr 1.3fr;gap:32px}}@media(min-width:1024px){.faq-topics{grid-template-columns:repeat(4,minmax(0,1fr))}}
.faq-topics .faq-icon{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;margin:0 0 12px;border-radius:12px;background:#edc35733}.faq-icon svg{width:24px;height:24px}
.static-mobile-navigation{display:none}@media(max-width:639px){body{padding-bottom:calc(4rem + env(safe-area-inset-bottom))}header{padding:12px 16px;border-bottom:1px solid #edc357}header>nav{display:none}.static-mobile-navigation{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));position:fixed;inset:auto 0 0;z-index:80;margin:0;gap:4px;height:calc(4rem + env(safe-area-inset-bottom));padding:4px 8px env(safe-area-inset-bottom);background:#fffaf0;border-top:1px solid #edc357;box-shadow:0 -2px 8px #60423915}.static-mobile-navigation a{display:flex;align-items:center;justify-content:center;min-height:44px;font-size:11px;font-weight:600;text-decoration:none}.static-mobile-navigation [aria-current]{background:#edc357;border-radius:8px}}
</style></head><body>${renderSiteHeader()}
<main id="main"><nav aria-label="Breadcrumb"><a href="/">Home</a>${pathname.startsWith('/collections/') && pathname !== '/collections/' ? '<a href="/collections/">Collections</a>' : ''}<span aria-current="page">${escapeHtml(title)}</span></nav><h1>${escapeHtml(title)}${pathname === '/about/' ? '<sup aria-hidden="true">™</sup>' : ''}</h1>${body}</main>
<div id="store-links">${renderSiteFooter()}</div>${renderMobileNavigation(pathname)}</body></html>`;
};

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

const budgetGiftGuide = (article, products) => {
  const money = value => `₹${value.toLocaleString('en-IN')}`;
  const priced = products.flatMap(product => {
    const range = priceRange(product);
    return range && Number.isFinite(range.low) ? [{ product, ...range }] : [];
  }).sort((a, b) => a.low - b.low);
  const bands = article.budgetBands.map((band, index) => {
    const minimum = index === 0 ? 0 : article.budgetBands[index - 1].maximumPrice;
    return { ...band, minimum, id: `budget-${band.maximumPrice}`,
      items: priced.filter(item => item.low > minimum && item.low <= band.maximumPrice) };
  });
  const cards = items => `<ul class="budget-grid">${items.map(({ product, low, high }) =>
    `<li class="budget-card"><a class="product-photo" href="/p/${toProductSlug(product)}/" aria-label="View ${escapeHtml(product.name)}">
      ${product.image ? `<img src="${escapeHtml(getProductImageUrl(product.image, 480))}" alt="${escapeHtml(product.name)}" width="480" height="480" loading="lazy" decoding="async">` : ''}</a>
      <div class="product-copy"><p class="budget-category">${escapeHtml(product.category)}</p>
        <h3><a href="/p/${toProductSlug(product)}/">${escapeHtml(product.name)}</a></h3>
        <div class="budget-purchase"><p class="product-price">${low !== high ? 'From ' : ''}${money(low)}</p>
          ${product.inStock ? `<a class="budget-cart" href="/p/${toProductSlug(product)}/" aria-label="Choose options for ${escapeHtml(product.name)}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H7M14 9v4M12 11h4"/></svg></a>` : ''}</div>
        <p class="note">${product.inStock ? 'Choose colours &amp; add to cart' : 'Currently out of stock'}</p></div></li>`).join('')}</ul>`;
  return `<section class="budget-intro" aria-label="Find a gift by budget">
    <p class="budget-eyebrow">Thoughtful gifting, made simple</p><p class="intro">${escapeHtml(article.intro)}</p>
    <nav class="budget-picker" aria-label="Choose a gift budget">${bands.map(band =>
      `<a href="#${band.id}"><span>Up to</span><strong>${money(band.maximumPrice)}</strong><span>${band.items.length} gift ${band.items.length === 1 ? 'idea' : 'ideas'} &rarr;</span></a>`).join('')}</nav>
    <p class="note">Grouped by starting product price, without repeats. Variant prices may differ. Shipping is separate; review your final checkout total.</p></section>
    ${bands.map(band => `<section class="budget-band" id="${band.id}" aria-labelledby="${band.id}-title">
      <p class="budget-eyebrow">${band.minimum === 0 ? `Up to ${money(band.maximumPrice)}` : `Over ${money(band.minimum)}, up to ${money(band.maximumPrice)}`}</p>
      <h2 id="${band.id}-title">${escapeHtml(band.title)}</h2><p class="note">${band.items.length} to explore</p><p>${escapeHtml(band.text)}</p>
      ${band.items.length ? cards(band.items.slice(0, 6)) : '<p>No gifts in this range right now. <a href="/collections/">Explore all collections</a>.</p>'}
      ${band.items.length > 6 ? `<details><summary>Show ${band.items.length - 6} more ${band.items.length === 7 ? 'gift' : 'gifts'} in this range</summary>${cards(band.items.slice(6))}</details>` : ''}</section>`).join('')}
    <aside class="budget-help"><div><h2>A more personal touch</h2><p>${escapeHtml(article.closing ?? '')}</p>
      <a href="/about/#contact-luvia">Ask Luvia about your gift &rarr;</a></div>
      <div><h2>Gifting for a group?</h2><p>Share your quantity, budget and occasion date. We will confirm options and timing before you order.</p>
      <a href="/bulk-orders/">Explore bulk gifting &rarr;</a></div></aside>`;
};

export const buildContentPages = (products, whatsappNumber, categories = [], bestsellerIds = [], testimonials = [], instagramSnapshot = null) => {
  const pages = new Map();
  const orderedCategories = [...categories].sort((a, b) => Number(Boolean(b.isSeasonal)) - Number(Boolean(a.isSeasonal)) || a.priority - b.priority);
  const groups = new Map(orderedCategories.filter(category => category.visible !== false).map(category => [
    category.name, category.isSeasonal ? products.filter(product => category.productIds?.includes(product.id)) : [],
  ]));
  for (const product of products) {
    if (orderedCategories.some(category => category.name === product.category && category.visible === false)) continue;
    const current = groups.get(product.category) ?? [];
    current.push(product);
    groups.set(product.category, current);
  }
  const visibleCollections = [...groups].filter(([, items]) => items.length > 0);
  const collectionsNavigation = visibleCollections.length ? `<section class="about-collections"><h2>Explore collections</h2>
    <p>Discover handmade crochet gifts and accessories by category.</p>
    <nav aria-label="Explore collections"><ul>${visibleCollections.map(([category, items]) => {
      const image = getCategoryImage(items, categories.find(item => item.name === category));
      const src = image ? getProductImageUrl(image, 160) : '/images/luvia-logo-320.webp';
      return `<li><a href="${escapeHtml(collectionPath(category))}" aria-label="${escapeHtml(category)}" aria-description="${items.length} ${items.length === 1 ? 'product' : 'products'}"><img src="${escapeHtml(src)}" alt="" width="64" height="64" loading="lazy" decoding="async"><div><strong>${escapeHtml(category)}</strong><span>${items.length} ${items.length === 1 ? 'product' : 'products'}</span></div><span class="collection-arrow" aria-hidden="true">&rarr;</span></a></li>`;
    }).join('')}</ul></nav>
    <a href="/collections/">View all collections</a></section>` : '';
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
      : `Explore ${category} from Luvia Creations. View handmade designs, product details and available variants.`));
    const cards = productCards(items);
    const schema = { ...baseSchema('CollectionPage', pathname, title, description), mainEntity: {
      '@type': 'ItemList', numberOfItems: items.length, itemListElement: items.map((product, index) => ({
        '@type': 'ListItem', position: index + 1, name: product.name, url: `${ORIGIN}/p/${toProductSlug(product)}/`,
      })),
    } };
    const collectionHtml = page(pathname, title, getBoundedMetaDescription(description), `<p class="intro">${escapeHtml(description)}</p>
      ${look}
      <p class="note">Prices shown are a catalogue snapshot and may vary by variant. Open a product for current price and availability. Shipping is shown at checkout.</p>
      ${items.length ? `<ul class="grid">${cards}</ul>` : '<p>No published products in this collection yet.</p>'}
      <p>Need help choosing? <a href="${contact}">Ask us on WhatsApp</a> or read the <a href="/faq/">ordering FAQ</a>.</p>${collectionsNavigation}`, schema, socialImage);
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
    const { path: pathname, title, description, metaDescription, empty } = collection;
    const items = pathname === '/bestsellers/' ? getBestsellerProducts(products, bestsellerIds) : getFeaturedProducts(products);
    const socialProduct = items.find(product => product.image);
    pages.set(pathname, page(pathname, title, metaDescription,
      `<p class="intro">${escapeHtml(description)}</p>${items.length ? `<ul class="grid">${productCards(items)}</ul>` : `<p>${escapeHtml(empty)}</p>`}
      <p class="note">Prices and availability are a catalogue snapshot. Open a product for current details.</p>${collectionsNavigation}`,
      { ...baseSchema('CollectionPage', pathname, title, description),
        breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: title, item: `${ORIGIN}${pathname}` },
        ] },
        mainEntity: { '@type': 'ItemList', numberOfItems: items.length, itemListElement: items.map((product, index) => ({
          '@type': 'ListItem', position: index + 1, name: product.name, url: `${ORIGIN}/p/${toProductSlug(product)}/`,
        })) },
      }, socialProduct ? new URL(getProductImageUrl(socialProduct.image, 1080), ORIGIN).href : undefined));
  }
  const title = 'Explore our handmade collections';
  const description = 'Browse Luvia Creations collections of handmade crochet accessories, toys, gifts and decor. Explore product details and request orders across India.';
  pages.set('/collections/', page('/collections/', title, description,
    `<p class="intro">Discover handmade crochet gifts, accessories, toys and decor by collection. Open a product to see its photos, options and current availability.</p><a class="button" href="/#products">Shop all products</a>
    <nav aria-label="Explore collections"><ul class="grid collection-grid">${collectionLinks.join('')}</ul></nav>`,
    baseSchema('CollectionPage', '/collections/', title, description)));
  const story = storeContent.brandStory;
  const guide = storeContent.giftGuide;
  pages.set(guide.path, page(guide.path, guide.title, guide.description,
    `<article class="gift-guide"><section class="budget-intro gift-hero" aria-label="Thoughtful gifts, without the guesswork">
      <p class="budget-eyebrow">A little thought. A lot of love.</p><h2>Thoughtful gifts, without the guesswork</h2>
      <p class="intro">${escapeHtml(guide.intro)}</p>
      <ol><li>1. Choose for their everyday</li><li>2. Add a personal touch</li><li>3. Check the date &amp; total</li></ol></section>
    <nav class="gift-start" aria-label="Related guides">${contentArticles.map(article =>
      `<a href="${escapeHtml(article.path)}" aria-label="${escapeHtml(article.title)}"><span class="budget-eyebrow">${article.budgetBands ? 'Find your budget' : 'A little inspiration'}</span><strong>${escapeHtml(article.title)}</strong><span aria-hidden="true">&rarr;</span></a>`).join('')}</nav>
    <div class="gift-steps">${guide.sections.map((section, index) =>
      `<section class="gift-step"><p class="budget-eyebrow" aria-hidden="true">${String(index + 1).padStart(2, '0')}</p><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.text)}</p><a href="${escapeHtml(section.link.href)}">${escapeHtml(section.link.label)}</a></section>`).join('')}</div>
    <nav class="gift-ordering" aria-label="Gift ordering information"><a href="/return-policy/">Read the return and refund policy</a><a href="${internationalQuote.path}">Request an international quote</a></nav></article>`,
    { ...baseSchema('WebPage', guide.path, guide.title, guide.description),
      breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: guide.title, item: `${ORIGIN}${guide.path}` },
      ] },
    }));
  for (const article of contentArticles) {
    const heroHref = article.sections?.[0]?.links[0]?.href;
    const heroProduct = heroHref ? products.find(product => `/p/${toProductSlug(product)}/` === heroHref) : undefined;
    const body = `<article class="${article.budgetBands ? 'budget-guide' : 'styling-guide'}">
      ${article.budgetBands ? budgetGiftGuide(article, products) : `<section class="styling-hero${heroProduct?.image ? ' has-photo' : ''}" aria-label="Handmade florals, styled your way">
        <div class="styling-intro"><p class="budget-eyebrow">The finishing touch</p><h2>Handmade florals, styled your way</h2><p>${escapeHtml(article.intro)}</p>
        <p class="note">For wedding mornings, festive evenings and little moments worth dressing up for.</p></div>
        ${heroProduct?.image ? `<figure><img src="${escapeHtml(getProductImageUrl(heroProduct.image, 1080))}" alt="${escapeHtml(heroProduct.name)} styling inspiration" width="1080" height="1080"></figure>` : ''}</section>`}
      ${article.sections ? article.sections.map((section, index) => `<section class="styling-step">
        <div><p class="budget-eyebrow">Style note ${String(index + 1).padStart(2, '0')}</p><h2>${escapeHtml(section.title)}</h2></div>
        <div class="styling-copy">${section.paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}
        <nav aria-label="${escapeHtml(section.title)} links">${section.links.map(link => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join('')}</nav></div>
      </section>`).join('') : ''}
      ${article.closing && !article.budgetBands ? `<p>${escapeHtml(article.closing)}</p>` : ''}
      <nav class="article-related" aria-label="Related guides"><a href="${guide.path}">${escapeHtml(guide.title)}</a>
        ${contentArticles.filter(related => related.path !== article.path).map(related =>
          `<a href="${escapeHtml(related.path)}">${escapeHtml(related.title)}</a>`).join('')}
      </nav></article>`;
    pages.set(article.path, page(article.path, article.title, article.description, body,
      { ...baseSchema('Article', article.path, article.title, article.description),
        breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: article.title, item: `${ORIGIN}${article.path}` },
        ] },
      }));
  }
  pages.set('/search/', page('/search/', 'Search products', 'Search Luvia Creations handmade crochet products by name, category, description or colour.',
    `<form role="search" action="/search/" method="get"><label for="product-search">Search products</label><input id="product-search" name="q" type="search" enterkeyhint="search" aria-describedby="search-help" placeholder="Try keychain, gajra or bunny"></form><p id="search-help">Results update as you type. Press Enter to save a shareable search URL.</p><p>Enable JavaScript for search results, or <a href="/collections/">browse our collections</a>.</p>${collectionsNavigation}`,
    baseSchema('WebPage', '/search/', 'Search products', 'Find handmade crochet products.'))
    .replace("form-action 'none'", "form-action 'self'").replace('</head>', '<meta name="robots" content="noindex,follow"></head>'));
  const aboutTitle = story.title;
  const aboutDescription = story.description;
  pages.set('/about/', page('/about/', aboutTitle, aboutDescription, `
    <section class="intro"><article aria-label="Luvia's founder story" class="card">
    <figure><img src="${escapeHtml(story.portrait.src)}" alt="${escapeHtml(story.portrait.alt)}" width="${story.portrait.width}" height="${story.portrait.height}" draggable="false" style="display:block;width:100%;max-width:240px;height:auto;border-radius:1rem;pointer-events:none;user-select:none;-webkit-touch-callout:none"><figcaption>${escapeHtml(story.founderNote.signature)} — ${escapeHtml(story.founderNote.role)}</figcaption></figure>
    <p><strong>${escapeHtml(story.subtitle)}</strong></p><p>${escapeHtml(story.intro)}</p>
    ${story.sections.map(section => `<section><h2>${escapeHtml(section.title)}</h2>${section.paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}</section>`).join('')}
    <section aria-labelledby="founder-note-title" class="card"><h2 id="founder-note-title">${escapeHtml(story.founderNote.title)}</h2>
    <p>${escapeHtml(story.founderNote.text)}</p><p><strong>${escapeHtml(story.founderNote.signature)}</strong><br>${escapeHtml(story.founderNote.role)}</p>
    <p><a href="${escapeHtml(story.linkedinUrl)}">${escapeHtml(story.linkedinLabel)}</a></p></section>
    <p><strong>${escapeHtml(story.closing)}</strong></p><a class="button" href="/collections/">${escapeHtml(story.shopLabel)}</a></article>
    <h2>Thoughtfully crafted crochet, made to be treasured</h2><p>${escapeHtml(storeContent.about[0])}</p>
    <p>${escapeHtml(storeContent.about[1])}</p>
    <h2>Personal touches, confirmed with you</h2><p>${escapeHtml(storeContent.about[2])}</p>
    <section class="about-contact" aria-labelledby="contact-luvia"><div class="about-contact-intro"><p class="budget-eyebrow">We'd love to hear from you</p>
    <h2 id="contact-luvia">Contact Luvia</h2><p>Gurugram, Haryana, India</p><a class="button" href="${contact}">Ask us on WhatsApp</a>
    <p class="contact-number">WhatsApp / mobile: <a href="${contact}">+${escapeHtml(whatsappNumber)}</a></p></div>
    <div class="about-contact-links"><p><strong>Orders</strong><br><a href="mailto:orders@luviacreations.com">orders@luviacreations.com</a></p>
    <p><strong>General enquiries</strong><br><a href="mailto:hello@luviacreations.com">hello@luviacreations.com</a></p>
    <p><a href="https://www.instagram.com/luvia.craftedwithlove/">Follow Luvia on Instagram</a></p>
    <p class="contact-help">Questions about ordering? <a href="/faq/#faq-ordering">Read our FAQ</a>.</p></div></section></section>
    ${collectionsNavigation}`,
    baseSchema('AboutPage', '/about/', aboutTitle, aboutDescription)));
  const faqTitle = 'Ordering, delivery & care FAQ';
  const faqDescription = 'Answers to Luvia Creations ordering questions: India checkout, international enquiries, custom colours, shipping, product care and returns.';
  const questions = storeContent.questions;
  const faqBody = storeContent.faqGroups.map(group => `<section class="faq-group" id="${group.id}" aria-labelledby="${group.id}-title">
    <div><h2 id="${group.id}-title">${escapeHtml(group.title)}</h2><p>${escapeHtml(group.description)}</p></div>
    <div class="faq-answers">${group.questionIds.map(id => {
      const entry = questions.find(([question]) => storeContent.faqAnchors[question] === id);
      if (!entry) throw new Error(`Unknown FAQ question: ${id}`);
      return `<details id="${id}"><summary>${escapeHtml(entry[0])}</summary><p>${escapeHtml(entry[1])}</p>${id === 'track-order' ? '<p><a href="/?account=orders">My orders</a> · <a href="/about/">Contact us</a></p>' : ''}</details>`;
    }).join('')}
    ${group.id === 'faq-care' ? '<details id="returns-refunds"><summary>What is the return and refund policy?</summary><p>Read our <a href="/return-policy/">return and refund policy</a> before ordering. Contact us if you need clarification about your order.</p></details>' : ''}</div></section>`).join('');
  pages.set('/faq/', page('/faq/', faqTitle, faqDescription, `<section class="budget-intro">
    <p class="budget-eyebrow">Good to know</p><h2>Little questions, clear answers</h2>
    <p class="intro">From your first pick to caring for your handmade piece, find the details that help you order with confidence.</p>
    <nav class="faq-topics" aria-label="FAQ topics">${storeContent.faqGroups.map(group =>
      `<a href="#${group.id}"><span class="faq-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${escapeHtml(group.iconPath)}"/></svg></span><strong>${escapeHtml(group.title)}</strong><span>${escapeHtml(group.description)}</span><span aria-hidden="true">&rarr;</span></a>`).join('')}</nav></section>${faqBody}
    <aside class="faq-help"><div><h2>Still have a little question?</h2><p>For a personal request or a detail about your order, get in touch before ordering. We will help you confirm what is possible.</p></div>
    <nav aria-label="More ordering help"><a href="/about/#contact-luvia">Contact Luvia</a><a href="${internationalQuote.path}">Request an international quote</a></nav></aside>`,
    baseSchema('WebPage', '/faq/', faqTitle, faqDescription)));
  for (const policy of policies) {
    const body = `<article><div class="budget-intro"><p class="budget-eyebrow">Clear details, considered care</p>
      <p class="intro">${escapeHtml(policy.description)}</p><p class="policy-updated">${escapeHtml(policy.dateLabel ?? 'Last updated')}: ${escapeHtml(policy.updated)}</p></div>
      <div class="policy-layout"><nav class="policy-toc" aria-label="On this page"><h2>On this page</h2>
      ${policy.sections.map((section, index) => `<a href="#${escapeHtml(section.id ?? `policy-section-${index + 1}`)}">${escapeHtml(section.title)}</a>`).join('')}</nav><div>`
      + policy.sections.map((section, index) => `<section class="policy-section" id="${escapeHtml(section.id ?? `policy-section-${index + 1}`)}"><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.text)}</p>${section.link
        ? `<p><a href="${escapeHtml(section.link.href)}">${escapeHtml(section.link.label)}</a></p>` : ''}</section>`).join('')
      + '</div></div><nav class="article-related" aria-label="Related policies">'
      + policies.filter(item => item.path !== policy.path).map(item => `<a href="${item.path}">${escapeHtml(item.title)}</a>`).join('')
      + '<a href="/return-policy/">Return and refund policy</a><a href="/about/">About &amp; contact</a></nav></article>';
    pages.set(policy.path, page(policy.path, policy.title, policy.description, body,
      baseSchema('WebPage', policy.path, policy.title, policy.description)));
  }
  pages.set(bulkOrders.path, page(bulkOrders.path, bulkOrders.title, getBoundedMetaDescription(bulkOrders.description), `
    <section class="intro"><h2>Handmade gifts for teams, clients &amp; celebrations</h2>
    <p>${escapeHtml(bulkOrders.description)}</p>
    <p>Share your quantity, budget, occasion and required delivery date to help us plan your enquiry.</p>
    <p><a class="button" href="mailto:${bulkOrders.email}?subject=${encodeURIComponent(bulkOrders.subject)}&amp;body=${encodeURIComponent(bulkOrders.message)}">Email for bulk orders</a>
    <a class="button" href="https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(bulkOrders.message)}">Enquire on WhatsApp</a></p>
    <p>${escapeHtml(bulkOrders.email)}</p><p class="note">${escapeHtml(bulkOrders.note)}</p>
    <p class="note">With JavaScript enabled, use our enquiry form to prepare a personalised email draft. Review and send it from your email app; preparing a draft does not send it automatically.</p></section>${collectionsNavigation}`,
    baseSchema('WebPage', bulkOrders.path, bulkOrders.title, bulkOrders.description)));
  pages.set(internationalQuote.path, page(internationalQuote.path, internationalQuote.title, internationalQuote.description,
    `<section class="budget-intro"><p class="budget-eyebrow">International orders · Request a quote</p>
    <p class="intro">${escapeHtml(internationalQuote.description)}</p><p>${escapeHtml(internationalQuote.notice)}</p>
    <ol><li>Choose products and quantities</li><li>Share your destination</li><li>Review and send your request</li></ol></section>
    <section class="intro"><h2>1. Choose products and quantities</h2>
    <p>Only published catalogue products can be quoted. With JavaScript enabled, search and select multiple products; otherwise, browse by collection and email us the product links and quantities.</p>
    ${[...new Set(products.map(product => product.category))].sort((a, b) => a.localeCompare(b)).map(category =>
      `<section><h3>${escapeHtml(category)}</h3><ul>${products.filter(product => product.category === category)
        .sort((a, b) => a.name.localeCompare(b.name)).map(product =>
          `<li><a href="/p/${toProductSlug(product)}/">${escapeHtml(product.name)}</a></li>`).join('')}</ul></section>`).join('')}
    <h2>2. Contact and delivery destination</h2><p>Share your name, reply email, country, city and ZIP / postal code. If your destination has no postal code, enter N/A. A state or province is needed only where applicable.</p>
    <p><a class="button" href="mailto:${internationalQuote.email}?subject=${encodeURIComponent(internationalQuote.subject)}">Email Luvia</a>
    <a class="button" href="https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent('Hello Luvia, I would like an international order quote. I will share product names and quantities, my name, email, country, city, state and postal code.')}">Contact Luvia on WhatsApp</a></p>
    <h2>3. Shipping, customs and quote terms</h2><p>${escapeHtml(storeContent.international.details)}</p><p>${escapeHtml(storeContent.international.customs)}</p><p>${escapeHtml(storeContent.international.returns)}</p></section>${collectionsNavigation}`,
    baseSchema('WebPage', internationalQuote.path, internationalQuote.title, internationalQuote.description)));
  pages.set(artisanOnboarding.path, page(artisanOnboarding.path, artisanOnboarding.title, artisanOnboarding.description,
    `<section class="intro"><p>${escapeHtml(artisanOnboarding.description)}</p><p>${escapeHtml(artisanOnboarding.notice)}</p>
    <h2>${escapeHtml(artisanOnboarding.dispatchTermsTitle)}</h2>${artisanOnboarding.dispatchTerms.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}
    <p>Applications are by private admin invitation. Enable JavaScript and open the invitation link to complete your application. If your link has expired, contact Luvia.</p>
    <h2>Application privacy notice</h2><p>${escapeHtml(artisanOnboarding.privacy)}</p>
    <p><a href="mailto:hello@luviacreations.com">Contact Luvia</a> · <a href="/privacy-policy/">Privacy Policy</a></p></section>`,
    baseSchema('WebPage', artisanOnboarding.path, artisanOnboarding.title, artisanOnboarding.description))
    .replace('</head>', '<meta name="robots" content="noindex,follow"><meta name="referrer" content="no-referrer"></head>'));
  pages.set('/customer-love/', page('/customer-love/', 'Customer Love',
    'Customer stories and handmade moments, shared with permission by Luvia Creations customers.',
    '<p class="intro">Made with love. Loved in real life.</p>'
    + (testimonials.length ? `<div class="grid">${testimonials.map(entry => {
      const taggedProducts = products.filter(item => entry.product_ids.includes(item.id));
      return `<figure class="card" id="testimonial-${escapeHtml(entry.id)}" tabindex="-1" style="scroll-margin-top:6rem">${entry.has_image && entry.image_url ? `<img src="${escapeHtml(entry.image_url)}" alt="${escapeHtml(entry.image_alt)}" width="480" height="480" loading="lazy" style="width:100%;height:auto;border-radius:12px">` : ''}
        <blockquote style="white-space:pre-line">${escapeHtml(entry.quote)}</blockquote><figcaption><a href="${testimonialPath(entry)}">${escapeHtml(entry.display_name)}</a></figcaption>
        ${taggedProducts.map(product => `<p><a href="/p/${toProductSlug(product)}/">Shop ${escapeHtml(product.name)}</a></p>`).join('')}</figure>`;
    }).join('')}</div>` : '<p>Customer stories will appear here once shared with permission.</p>'),
    baseSchema('CollectionPage', '/customer-love/', 'Customer Love', 'Selected customer stories shared with permission.')));
  for (const entry of testimonials) {
    const pathname = testimonialPath(entry);
    const title = `Customer story from ${entry.display_name}`;
    const excerpt = getBoundedMetaDescription(entry.quote, 95);
    const description = `${excerpt} Shared with permission by a Luvia Creations customer.`;
    const taggedProducts = products.filter(item => entry.product_ids.includes(item.id));
    const image = entry.has_image && entry.image_url ? entry.image_url : null;
    const taggedImage = taggedProducts.find(product => product.image)?.image;
    pages.set(pathname, page(pathname, title, getBoundedMetaDescription(description),
      `<nav aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/customer-love/">Customer Love</a> › <span aria-current="page">${escapeHtml(entry.display_name)}</span></nav>
      <figure class="card" style="max-width:640px">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(entry.image_alt)}" width="480" height="480" style="width:100%;height:auto;border-radius:12px">` : ''}
        <blockquote style="white-space:pre-line">${escapeHtml(entry.quote)}</blockquote><figcaption>${escapeHtml(entry.display_name)}</figcaption></figure>
      ${taggedProducts.length ? `<h2>Products in this story</h2><ul>${taggedProducts.map(product => `<li><a href="/p/${toProductSlug(product)}/">Shop ${escapeHtml(product.name)}</a></li>`).join('')}</ul>` : ''}
      <p><a href="/customer-love/">See all customer stories</a></p>`,
      { ...baseSchema('WebPage', pathname, title, description),
        isPartOf: { '@type': 'CollectionPage', name: 'Customer Love', url: `${ORIGIN}/customer-love/` },
        breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
          { name: 'Home', item: `${ORIGIN}/` },
          { name: 'Customer Love', item: `${ORIGIN}/customer-love/` },
          { name: entry.display_name, item: `${ORIGIN}${pathname}` },
        ].map((item, index) => ({ '@type': 'ListItem', position: index + 1, ...item })) } },
      image ?? (taggedImage ? new URL(getProductImageUrl(taggedImage, 1080), ORIGIN).href : undefined)));
  }
  const instagramPath = '/from-instagram/';
  const instagramTitle = instagramPageTitle;
  const instagramDescription = instagramPageDescription;
  const instagramCards = (instagramSnapshot?.posts ?? []).map((post, index) => {
    const caption = instagramCaptionSummary(post.caption, 90);
    const fullCaption = post.caption.trim();
    const product = products.find(item => item.id === post.productId && item.inStock);
    const productPath = product ? `/p/${toProductSlug(product)}/` : null;
    const range = product ? priceRange(product) : null;
    const price = range ? `${range.low !== range.high ? 'From ' : ''}₹${range.low.toLocaleString('en-IN')}` : 'In stock';
    const alt = product ? `Handmade crochet ${product.name}` : caption || `Instagram ${post.mediaType === 'VIDEO' ? 'video' : 'post'} from @${instagramSnapshot.username}`;
    const whatsapp = product ? `https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi Luvia, I'm interested in ${product.name}.\n\n${ORIGIN}${productPath}`)}` : '';
    return `<li class="card"><a href="${escapeHtml(productPath ?? post.permalink)}"><img src="${escapeHtml(post.previewUrl)}" alt="${escapeHtml(alt)}" width="480" height="600" loading="${index === 0 ? 'eager' : 'lazy'}" ${index === 0 ? 'fetchpriority="high" ' : ''}decoding="async" style="display:block;width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;border-radius:12px"></a>
      ${post.mediaType === 'VIDEO' ? '<span aria-label="Video">▶ Video</span>' : ''}
      ${caption && caption !== fullCaption ? `<details><summary>${escapeHtml(caption)} <span>Read more</span></summary><p>${escapeHtml(fullCaption)}</p></details>` : fullCaption ? `<p>${escapeHtml(fullCaption)}</p>` : ''}<p><time datetime="${escapeHtml(post.timestamp)}">${escapeHtml(new Date(post.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }))}</time></p><a href="${escapeHtml(post.permalink)}">View on Instagram</a>
      ${product ? `<p>${escapeHtml(price)} · <a href="${productPath}">Shop ${escapeHtml(product.name)}</a></p><a href="${escapeHtml(whatsapp)}" rel="nofollow">Ask on WhatsApp</a>` : ''}</li>`;
  }).join('');
  pages.set(instagramPath, page(instagramPath, instagramTitle, instagramDescription,
    `<p class="intro">${escapeHtml(instagramPageIntro)}</p>
      <p><a class="button" href="https://www.instagram.com/luvia.craftedwithlove/">Follow Luvia on Instagram</a></p>
      ${instagramSnapshot?.stale ? '<p>Showing saved posts while Instagram is temporarily unavailable.</p>' : ''}
      ${instagramCards ? `<ul class="grid instagram-grid">${instagramCards}</ul>` : '<p>Recent posts are available on Instagram.</p>'}
      <p><a class="button" href="https://www.instagram.com/luvia.craftedwithlove/">Follow Luvia on Instagram</a></p>`,
    { ...baseSchema('CollectionPage', instagramPath, instagramTitle, instagramDescription),
      breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: instagramTitle, item: `${ORIGIN}${instagramPath}` },
      ] } },
    instagramSnapshot?.posts[0] ? `${ORIGIN}/instagram-snapshot/${instagramSnapshot.posts[0].id}.jpg` : undefined)
    .replace('</head>', `${instagramSnapshot ? `<script id="instagram-snapshot" type="application/json">${JSON.stringify(instagramSnapshot).replace(/</g, '\\u003c')}</script>` : ''}</head>`));
  return pages;
};

export const renderContentSitemap = (products, today, pages, categories = [], customerLove = { testimonials: [], lastmod: null }) =>
  renderSitemap(products, today, publicContentPages(pages)
    .map(([pathname]) => {
      const story = customerLove.testimonials.find(entry => testimonialPath(entry) === pathname);
      if (story) return {
        pathname,
        lastmod: story.updated_on ?? customerLove.lastmod,
        images: story.has_image && typeof story.image_url === 'string' && /^https:\/\//.test(story.image_url) ? [story.image_url] : [],
      };
      if (pathname === '/customer-love/') return {
        pathname,
        lastmod: customerLove.lastmod,
        images: customerLove.testimonials.map(entry => entry.image_url)
          .filter((url, index, urls) => typeof url === 'string' && /^https:\/\//.test(url) && urls.indexOf(url) === index),
      };
      const category = categories.find(settings => collectionPath(settings.name) === pathname);
      const items = products.filter(product => category?.isSeasonal
        ? category.productIds?.includes(product.id) : collectionPath(product.category) === pathname);
      const image = getProductImageUrl(getCategoryImage(items, category), 960);
      return { pathname, images: /^https:\/\//.test(image) ? [image] : [] };
    }));
