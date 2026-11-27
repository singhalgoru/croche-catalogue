import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import ProductCard from './ProductCard';
import CatalogueNotice from './CatalogueNotice';
import PriceFilter from './PriceFilter';
import Header from './Header';
import Footer from './Footer';
import CollectionGrid from './CollectionGrid';
import CategoryShareButton from './CategoryShareButton';
import CategoryLook from './CategoryLook';
import storeContent from '../content/storeContent.json';
import contentArticles from '../content/contentArticles.json';
import { productImageProtection } from '../utils/imageProtection';
import policies from '../content/policies.json';
import bulkOrders from '../content/bulkOrders.json';
import BulkOrders from './BulkOrders';
import InternationalQuote from './InternationalQuote';
import internationalQuote from '../content/internationalQuote.json';
import { collectionBreadcrumbList, collectionPath } from '../utils/collectionLink.js';
import { toProductPageUrl } from '../utils/productLink';
import { compareCatalogueProducts } from '../utils/catalogueSort';
import { formatWhatsAppNumber, getGeneralWhatsAppLink } from '../utils/whatsapp';
import type { CategorySettings, Product, ProductVariant } from '../types/product';
import { compareCategorySettings, getSeasonalAnnouncement, matchesCategory } from '../utils/categorySelection';
import { limitCategoryOverview } from '../utils/categoryOverview.js';
import { getCataloguePriceBands, matchesCataloguePriceRange, type CataloguePriceRange } from '../utils/cataloguePrice';
import { getCategoryShareImageUrl } from '../utils/categoryShare';
import { useBestsellerIds } from '../hooks/useBestsellerIds';
import { getBestsellerProducts, getFeaturedProducts, productCollections } from '../utils/productCollections.js';
import { matchesProductSearch } from '../utils/productSearch';
import { addRecentSearch, readRecentSearches, writeRecentSearches } from '../utils/recentSearches';
import artisanOnboarding from '../content/artisanOnboarding.json';
import CustomerLove from './CustomerLove';
import type { Testimonial } from '../services/customerLove';
import { readTestimonialSlug } from '../utils/testimonialLink';
import { getBoundedMetaTitle } from '../utils/productMetaTitle.js';
import { getBoundedMetaDescription } from '../utils/metaDescription.js';
import { getProductImageUrl } from '../utils/productImageUrl';
import { getCategoryImage } from '../utils/categoryImage.js';
import BudgetGiftGuide from './BudgetGiftGuide';
import { InstagramIcon, MailIcon, WhatsAppIcon } from './SocialIcons';
import InstagramFeed from './InstagramFeed';
import { instagramPageTitle, instagramPageDescription, instagramPageIntro } from '../utils/instagramContent.js';

const ArtisanApplicationForm = lazy(() => import('./ArtisanApplicationForm'));
const ArtisanPaymentForm = lazy(() => import('./ArtisanPaymentForm'));
const ArtisanWorkAcceptance = lazy(() => import('./ArtisanWorkAcceptance'));

interface Props {
  products: Product[];
  categorySettings: CategorySettings[];
  isLoading: boolean;
  loadError: string | null;
  onRetry?: () => Promise<void>;
  hasCatalogueSnapshot: boolean;
  onAddToCart: (product: Product, variant: ProductVariant) => Promise<boolean>;
  isCartBusy: boolean;
  getCartQuantity: (productId: string) => number;
  cartItemCount: number;
  cartUpdateCount: number;
  onOpenCart: () => void;
  onOpenAccount?: (mode: 'signin' | 'signup') => void;
  onOpenOrders?: () => void;
  accountName?: string | null;
  initialBestsellerIds?: string[];
}

export default function StorePages({
  products, categorySettings, isLoading, loadError, hasCatalogueSnapshot,
  onAddToCart, isCartBusy, getCartQuantity, cartItemCount, cartUpdateCount, onOpenCart, onOpenAccount, accountName,
  onOpenOrders, onRetry, initialBestsellerIds = [],
}: Props) {
  const [catalogueTime, setCatalogueTime] = useState(Date.now);
  const [activePriceRange, setActivePriceRange] = useState<CataloguePriceRange | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '');
  const [{ terms: recentSearches, error: searchHistoryError }, setSearchHistory] = useState<{ terms: string[]; error: string }>(() => {
    if (window.location.pathname.replace(/\/?$/, '/') !== '/search/') return { terms: [], error: '' };
    try {
      return { terms: readRecentSearches(), error: '' };
    } catch (error) {
      console.error('Unable to read recent searches:', error);
      return { terms: [], error: 'Recent searches could not be loaded on this device.' };
    }
  });
  const pathname = window.location.pathname;
  const incomingCollection = new URLSearchParams(window.location.search).get('collectionPage');
  const requestedPath = incomingCollection ? `/collections/${encodeURIComponent(incomingCollection)}/` : pathname.replace(/\/?$/, '/');
  const productCollection = productCollections.find(item => item.path === requestedPath);
  const bestsellers = useBestsellerIds(initialBestsellerIds, requestedPath === '/bestsellers/');
  const curatedProducts = useMemo(() => requestedPath === '/bestsellers/'
    ? getBestsellerProducts(products, bestsellers.ids) : getFeaturedProducts(products), [products, requestedPath, bestsellers.ids]);
  const policy = policies.find(item => item.path === requestedPath);
  const isBulkOrders = requestedPath === bulkOrders.path;
  const isInternationalQuote = requestedPath === internationalQuote.path;
  const isAbout = requestedPath === '/about/';
  const isInstagramPage = requestedPath === '/from-instagram/';
  const isGiftGuide = requestedPath === storeContent.giftGuide.path;
  const article = contentArticles.find(item => item.path.replace(/\/?$/, '/') === requestedPath);
  const articleHeroHref = article?.sections?.[0]?.links[0]?.href;
  const articleHeroProduct = articleHeroHref ? products.find(product => toProductPageUrl(product).endsWith(articleHeroHref)) : undefined;
  const isCustomerLove = requestedPath === '/customer-love/';
  const storySlug = readTestimonialSlug(requestedPath) ?? undefined;
  const isStory = storySlug !== undefined;
  // undefined while loading; null when the story is unpublished or unknown.
  const [story, setStory] = useState<Testimonial | null | undefined>(undefined);
  const isSearch = requestedPath === '/search/';
  const isArtisans = requestedPath === artisanOnboarding.path;
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isSearch && window.innerWidth < 640) searchInputRef.current?.focus({ preventScroll: true });
  }, [isSearch]);
  const updateRecentSearches = (terms: string[]) => {
    try {
      writeRecentSearches(terms);
      setSearchHistory({ terms, error: '' });
    } catch (error) {
      console.error('Unable to save recent searches:', error);
      setSearchHistory({ terms, error: 'Changes to recent searches could not be saved on this device.' });
    }
  };
  const submitSearch = (query: string) => {
    const value = query.trim().replace(/\s+/g, ' ');
    setSearchQuery(value);
    const url = new URL(window.location.href);
    if (value) {
      url.searchParams.set('q', value);
      updateRecentSearches(addRecentSearch(recentSearches, value));
    } else url.searchParams.delete('q');
    window.history.replaceState(window.history.state, '', url);
  };
  const searchTerm = searchQuery.trim();
  const searchProducts = products.filter(product => matchesProductSearch(product, searchTerm));
  const isCollection = requestedPath.startsWith('/collections/') && requestedPath !== '/collections/';
  const isCollectionsHub = requestedPath === '/collections/';
  const showCatalogue = hasCatalogueSnapshot || (!isLoading && !loadError);
  const categories = useMemo(() => [...categorySettings].sort(compareCategorySettings), [categorySettings]);
  const visibleCategories = useMemo(() => {
    return categories.filter(item => item.visible !== false && products.some(product => matchesCategory(product, item.name, categories)));
  }, [categories, products]);
  const selectedCategory = categories.find(item => item.visible !== false && collectionPath(item.name) === requestedPath);
  const category = selectedCategory?.name;
  const collectionProducts = useMemo(() => products.filter(product => category && matchesCategory(product, category, categories))
    .sort((a, b) => compareCatalogueProducts(a, b, { now: catalogueTime, categoryRanks: new Map() })), [category, categories, products, catalogueTime]);
  const collectionShareImageUrl = useMemo(
    () => getCategoryShareImageUrl(category, collectionProducts, categories),
    [category, categories, collectionProducts],
  );
  const collectionPriceBands = useMemo(() => getCataloguePriceBands(collectionProducts), [collectionProducts]);
  const filteredCollectionProducts = useMemo(
    () => collectionProducts.filter(product => matchesCataloguePriceRange(product, activePriceRange)),
    [collectionProducts, activePriceRange],
  );
  const descriptions: Record<string, string> = storeContent.collectionDescriptions;
  const faqAnchors: Record<string, string> = storeContent.faqAnchors;
  const description = limitCategoryOverview(selectedCategory?.overview || (category ? Object.hasOwn(descriptions, category) ? descriptions[category]
    : `Explore ${category} from Luvia Creations. View handmade designs, product details and available variants.` : ''));
  const title = productCollection?.title ?? policy?.title ?? (isStory ? story ? `Customer story from ${story.display_name}` : story === null ? 'Customer story unavailable' : 'Customer story'
    : isCustomerLove ? 'Customer Love' : isGiftGuide ? storeContent.giftGuide.title : isInstagramPage ? instagramPageTitle : article?.title ?? (isInternationalQuote ? internationalQuote.title : isArtisans ? artisanOnboarding.title : isSearch ? 'Search products' : isBulkOrders ? bulkOrders.title : isAbout ? storeContent.brandStory.title
    : pathname.startsWith('/faq') ? 'Ordering, delivery & care FAQ'
      : isCollection ? category ? `Handmade ${category}` : 'Collection unavailable'
        : 'Explore our handmade collections'));

  useEffect(() => {
    const revealSection = () => {
      const target = document.getElementById(window.location.hash.slice(1));
      if (!target) return;
      if (target instanceof HTMLDetailsElement) target.open = true;
      if (target.id === 'materials-sizing-care') {
        const care = document.getElementById('product-care');
        if (care instanceof HTMLDetailsElement) care.open = true;
      }
      target.scrollIntoView?.({ block: 'start' });
    };
    revealSection();
    window.addEventListener('hashchange', revealSection);
    return () => window.removeEventListener('hashchange', revealSection);
  }, [requestedPath]);

  useEffect(() => {
    const timer = window.setInterval(() => setCatalogueTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isLoading && !hasCatalogueSnapshot) return;
    if (isStory) {
      // Prerendered story pages already carry accurate metadata; only correct it once data is known.
      if (story === undefined) return;
      document.title = getBoundedMetaTitle(title);
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[property="og:title"], meta[name="twitter:title"]')) meta.content = document.title;
      if (story === null) {
        const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]') ?? document.createElement('meta');
        robots.name = 'robots';
        robots.content = 'noindex,follow';
        if (!robots.isConnected) document.head.append(robots);
      }
      return;
    }
    document.title = getBoundedMetaTitle(title);
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = `${window.location.origin}${requestedPath}`;
    if (isSearch || isArtisans) {
      const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]') ?? document.createElement('meta');
      robots.name = 'robots';
      robots.content = 'noindex,follow';
      if (!robots.isConnected) document.head.append(robots);
    }
    if (productCollection || policy || isBulkOrders || isInternationalQuote || isAbout || isArtisans || isCustomerLove || isGiftGuide || isInstagramPage || article) {
      const metaDescription = productCollection?.metaDescription ?? policy?.description ?? (article?.description ?? (isGiftGuide ? storeContent.giftGuide.description : isInstagramPage ? instagramPageDescription : isCustomerLove ? 'Customer stories and handmade moments, shared with permission by Luvia Creations customers.' : isInternationalQuote ? internationalQuote.description : isArtisans ? artisanOnboarding.description : isAbout ? storeContent.brandStory.description : bulkOrders.description));
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]')) meta.content = isBulkOrders ? getBoundedMetaDescription(metaDescription) : metaDescription;
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[property="og:title"], meta[name="twitter:title"]')) meta.content = document.title;
    }
    if (productCollection) {
      const image = curatedProducts.find(product => product.image)?.image;
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[property="og:image"], meta[name="twitter:image"]')) {
        if (!meta.content.startsWith(`${window.location.origin}${requestedPath}og-`)) {
          meta.content = image ? new URL(getProductImageUrl(image, 1080), window.location.origin).href : `${window.location.origin}/images/luvia-logo.jpg`;
        }
      }
    }
    if (isCollection) {
      const summary = description || 'This collection is no longer available. Explore the current Luvia collections.';
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[property="og:image"], meta[name="twitter:image"]')) {
        if (!meta.content.startsWith(`${window.location.origin}${requestedPath}og`)) {
          meta.content = collectionShareImageUrl || `${window.location.origin}/images/luvia-logo.jpg`;
        }
      }
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]')) meta.content = getBoundedMetaDescription(summary);
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[property="og:title"], meta[name="twitter:title"]')) meta.content = document.title;
      const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]') ?? document.createElement('meta');
      robots.name = 'robots';
      robots.content = category && collectionProducts.length > 0 ? 'index,follow' : 'noindex,follow';
      if (!robots.isConnected) document.head.append(robots);
    }
    const schema = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    if (schema && (productCollection || requestedPath.startsWith('/collections/'))) {
      const listed = productCollection ? curatedProducts.map(product => ({
        name: product.name, url: toProductPageUrl(product),
      })) : isCollection ? collectionProducts.map(product => ({
        name: product.name, url: toProductPageUrl(product),
      })) : visibleCategories.map(item => ({ name: item.name, url: `${window.location.origin}${collectionPath(item.name)}` }));
      schema.textContent = JSON.stringify({
        '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: `${window.location.origin}${requestedPath}`,
        breadcrumb: productCollection ? {
          '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${window.location.origin}/` },
            { '@type': 'ListItem', position: 2, name: title, item: `${window.location.origin}${requestedPath}` },
          ],
        } : collectionBreadcrumbList(requestedPath, title, window.location.origin),
        mainEntity: { '@type': 'ItemList', numberOfItems: listed.length, itemListElement: listed.map((item, index) => ({
          '@type': 'ListItem', position: index + 1, ...item,
        })) },
      });
    }
    if (incomingCollection && category) window.history.replaceState(null, '', collectionPath(category));
  }, [visibleCategories, category, collectionProducts, collectionShareImageUrl, description, hasCatalogueSnapshot, incomingCollection, isAbout, isGiftGuide, isInstagramPage, isCustomerLove, isStory, story, isSearch, isArtisans, isBulkOrders, isInternationalQuote, isCollection, isLoading, policy, requestedPath, title, productCollection, curatedProducts, article]);

  const categoryLinks = (
    <nav aria-label="Explore collections">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {visibleCategories.map(item => {
          const items = products.filter(product => matchesCategory(product, item.name, categories));
          const count = items.length;
          const image = getCategoryImage(items, item);
          return <li key={item.name} className="min-w-0">
            <a href={collectionPath(item.name)} aria-label={item.name} aria-description={`${count} ${count === 1 ? 'product' : 'products'}`} className={`group flex h-full min-h-20 items-center gap-2 rounded-2xl border border-mustard/40 p-3 text-left transition-colors hover:border-cocoa/40 hover:bg-mustard/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa sm:gap-3 ${item.isSeasonal ? 'bg-mustard/15' : 'bg-white/70'}`}>
              <img src={image ? getProductImageUrl(image, 160) : '/images/luvia-logo-320.webp'} alt="" width={64} height={64}
                loading="lazy" decoding="async" className="h-10 w-10 shrink-0 rounded-xl bg-cream-dark object-contain sm:h-16 sm:w-16" {...productImageProtection} />
              <span className="min-w-0"><span className="block font-heading text-sm font-bold leading-snug group-hover:underline sm:text-base">{item.name}</span>
                <span className="mt-1 block text-xs text-cocoa/70">{count} {count === 1 ? 'product' : 'products'}</span></span>
              <span aria-hidden="true" className="ml-auto hidden shrink-0 text-lg text-cocoa/65 sm:block">&rarr;</span>
            </a>
          </li>;
        })}
      </ul>
    </nav>
  );
  return <div className={`flex min-h-screen flex-col ${isSearch ? 'mobile-search-page' : ''}`}>
    <Header compact alignLogoLeft showHeading={false} showInstallPrompt={false} categories={showCatalogue ? visibleCategories.map(item => item.name) : []}
      seasonalAnnouncement={getSeasonalAnnouncement(categories, products)}
      seasonalCategories={categories.filter(item => item.isSeasonal).map(item => item.name)}
      cartItemCount={cartItemCount} cartUpdateCount={cartUpdateCount} onOpenCart={onOpenCart} onOpenAccount={onOpenAccount} onOpenOrders={onOpenOrders} accountName={accountName} />
    <main className={`mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 text-cocoa ${isSearch ? 'pb-6 sm:py-6' : 'py-6'}`}>
      <nav aria-label="Breadcrumb" className={`${isSearch ? 'hidden sm:flex' : 'flex'} flex-wrap items-center gap-3 text-sm`}><a href="/" className="inline-flex min-h-11 min-w-11 items-center underline">Home</a>
        {isCollection && <a href="/collections/" className="underline">Collections</a>}
        {isStory && <a href="/customer-love/" className="underline">Customer Love</a>}<span aria-current="page">{title}</span></nav>
      <h1 className={`font-heading text-3xl font-bold ${isSearch ? 'sr-only sm:not-sr-only' : ''}`}>
        {isInstagramPage && <span className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(45deg,#feda75_0%,#fa7e1e_25%,#d62976_50%,#962fbf_75%,#4f5bd5_100%)] align-middle text-white" aria-hidden="true">
          <InstagramIcon className="h-5 w-5" />
        </span>}{title}{isAbout && <sup aria-hidden="true">™</sup>}
      </h1>
      {isStory && <CustomerLove products={products} storySlug={storySlug} onStoryResolved={setStory} />}
      {isCustomerLove && <><div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cocoa/70">Little moments, beautifully handmade</p>
        <p className="font-heading text-xl">Made with love. Loved in real life.</p></div>
        <CustomerLove products={products} page /></>}
      {policy && <article className="space-y-6">
        <div className="rounded-3xl border border-mustard/40 bg-mustard/10 p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-wider text-cocoa/60">Clear details, considered care</p>
          <p className="mt-3 max-w-2xl leading-relaxed">{policy.description}</p>
          <p className="mt-3 text-xs text-cocoa/65">{'dateLabel' in policy ? policy.dateLabel : 'Last updated'}: {policy.updated}</p>
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <nav aria-label="On this page" className="rounded-2xl border border-cocoa/10 bg-white p-4 lg:sticky lg:top-24">
            <h2 className="mb-2 font-heading text-lg font-bold">On this page</h2>
            {policy.sections.map((section, index) => {
              const sectionId = 'id' in section && typeof section.id === 'string' ? section.id : `policy-section-${index + 1}`;
              return <a key={section.title} href={`#${sectionId}`}
                className="flex min-h-11 items-center py-2 text-sm leading-snug hover:underline">{section.title}</a>;
            })}
          </nav>
          <div className="space-y-4">
            {policy.sections.map((section, index) => {
              const sectionId = 'id' in section && typeof section.id === 'string' ? section.id : `policy-section-${index + 1}`;
              return <section key={section.title} id={sectionId}
                className="scroll-mt-24 space-y-3 rounded-2xl border border-cocoa/10 bg-white p-5 sm:p-6">
                <h2 className="font-heading text-xl font-bold">{section.title}</h2>
                <p className="text-sm leading-relaxed">{section.text}</p>
                {section.link && <a href={section.link.href} className="inline-flex min-h-11 items-center text-sm font-semibold underline">{section.link.label}</a>}
              </section>;
            })}
          </div>
        </div>
        <nav aria-label="Related policies" className="flex flex-wrap gap-4 rounded-2xl border border-mustard/40 bg-mustard/10 p-4 text-sm">
          {policies.filter(item => item.path !== policy.path).map(item =>
            <a key={item.path} href={item.path} className="min-h-11 underline">{item.title}</a>)}
          <a href="/about/" className="min-h-11 underline">About &amp; contact</a>
        </nav>
      </article>}
      {loadError && !isArtisans && <CatalogueNotice message={loadError} onRetry={onRetry} />}
      {isLoading && !isArtisans && <p role="status">Checking the latest collections and availability…</p>}
      {policy ? null : isInstagramPage ? <><p className="max-w-3xl leading-relaxed">{instagramPageIntro}</p><InstagramFeed products={products} presentation="gallery" /></> : isGiftGuide ? <article className="space-y-8">
        <section aria-label="Thoughtful gifts, without the guesswork" className="rounded-3xl border border-mustard/40 bg-mustard/10 p-5 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cocoa/65">A little thought. A lot of love.</p>
          <h2 className="mt-3 font-heading text-2xl font-bold sm:text-3xl">Thoughtful gifts, without the guesswork</h2>
          <p className="mt-3 max-w-2xl leading-relaxed">{storeContent.giftGuide.intro}</p>
          <ol className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
            {['Choose for their everyday', 'Add a personal touch', 'Check the date & total'].map((step, index) =>
              <li key={step} className="rounded-full border border-cocoa/10 bg-white px-3 py-2">{index + 1}. {step}</li>)}
          </ol>
        </section>
        <nav aria-label="Related guides" className="grid gap-4 sm:grid-cols-2">
          {contentArticles.map(item => <a key={item.path} href={item.path} aria-label={item.title}
            className="group rounded-2xl border border-mustard/50 bg-white p-5 transition-colors hover:border-cocoa/40 sm:p-6">
            <span className="mb-3 block text-xs font-semibold uppercase tracking-wider text-cocoa/60">
              {'budgetBands' in item ? 'Find your budget' : 'A little inspiration'}
            </span>
            <span className="font-heading text-xl font-bold group-hover:underline">{item.title}</span>
            <span aria-hidden="true" className="mt-4 block text-xl">&rarr;</span>
          </a>)}
        </nav>
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          {storeContent.giftGuide.sections.map((section, index) => <section key={section.title}
            className={`flex flex-col items-start rounded-2xl border border-cocoa/10 p-5 sm:p-6 ${index === storeContent.giftGuide.sections.length - 1 ? 'bg-cocoa text-cream sm:col-span-2' : 'bg-white'}`}>
            <p aria-hidden="true" className="mb-3 font-heading text-2xl font-bold opacity-50">{String(index + 1).padStart(2, '0')}</p>
            <h2 className="font-heading text-xl font-bold">{section.title}</h2>
            <p className="mb-4 mt-3 max-w-3xl text-sm leading-relaxed">{section.text}</p>
            <a href={section.link.href} className="mt-auto inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">{section.link.label}</a>
          </section>)}
        </div>
        <nav aria-label="Gift ordering information" className="flex flex-wrap justify-between gap-3 rounded-2xl border border-cocoa/10 p-4 text-sm">
          <a href="/return-policy/" className="inline-flex min-h-11 items-center underline">Read the return and refund policy</a>
          <a href={internationalQuote.path} className="inline-flex min-h-11 items-center underline">Request an international quote</a>
        </nav>
      </article> : article ? <article className="space-y-8">
        {'budgetBands' in article && article.budgetBands
          ? <BudgetGiftGuide article={article} products={products} showCatalogue={showCatalogue}
            onAddToCart={onAddToCart} isCartBusy={isCartBusy || isLoading || Boolean(loadError)} getCartQuantity={getCartQuantity} />
          : <section aria-label="Handmade florals, styled your way"
            className={`grid overflow-hidden rounded-3xl border border-mustard/40 bg-mustard/10 ${articleHeroProduct?.image ? 'md:grid-cols-2' : ''}`}>
            <div className="flex flex-col justify-center space-y-4 p-5 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-cocoa/65">The finishing touch</p>
              <h2 className="font-heading text-2xl font-bold sm:text-3xl">Handmade florals, styled your way</h2>
              <p className="max-w-2xl leading-relaxed">{article.intro}</p>
              <p className="text-sm text-cocoa/70">For wedding mornings, festive evenings and little moments worth dressing up for.</p>
            </div>
            {articleHeroProduct?.image && <figure className="m-0 aspect-[4/3] overflow-hidden md:aspect-square">
              <img src={getProductImageUrl(articleHeroProduct.image, 1080)} alt={`${articleHeroProduct.name} styling inspiration`}
                width={1080} height={1080} {...productImageProtection} className="h-full w-full object-cover" />
            </figure>}
          </section>}
        {'sections' in article && article.sections?.map((section, index) => <section key={section.title}
          className="grid gap-4 rounded-3xl border border-cocoa/10 bg-white p-5 sm:p-7 md:grid-cols-[0.7fr_1.3fr]">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cocoa/55">Style note {String(index + 1).padStart(2, '0')}</p>
            <h2 className="font-heading text-2xl font-bold">{section.title}</h2>
          </div>
          <div className="space-y-4">
            {section.paragraphs.map(paragraph => <p key={paragraph} className="text-sm leading-relaxed text-cocoa/85">{paragraph}</p>)}
            <nav aria-label={`${section.title} links`} className="flex flex-wrap gap-2">
              {section.links.map(link => <a key={link.href} href={link.href} className="inline-flex min-h-11 items-center rounded-full border border-cocoa/20 px-4 py-2 text-sm font-semibold hover:bg-mustard/10">{link.label}</a>)}
            </nav>
          </div>
        </section>)}
        <nav aria-label="Related guides" className="flex flex-wrap gap-4 rounded-2xl border border-mustard/40 bg-mustard/10 p-5 text-sm">
          <a href={storeContent.giftGuide.path} className="inline-flex min-h-11 items-center underline">{storeContent.giftGuide.title}</a>
          {contentArticles.filter(item => item.path !== article.path).map(item =>
            <a key={item.path} href={item.path} className="inline-flex min-h-11 items-center underline">{item.title}</a>)}
        </nav>
      </article> : isArtisans ? <Suspense fallback={<p role="status">Loading application...</p>}>
        {new URLSearchParams(window.location.hash.slice(1)).has('work') ? <ArtisanWorkAcceptance />
          : new URLSearchParams(window.location.hash.slice(1)).has('payment') ? <ArtisanPaymentForm /> : <ArtisanApplicationForm />}
      </Suspense> : isSearch ? <>
        <p className="hidden sm:block">Find handmade favourites by name, category, description or colour.</p>
        <form role="search" action="/search/" method="get" className="mobile-search sticky top-0 z-50 -mx-4 !mt-0 flex flex-wrap items-end gap-2 border-b border-mustard/30 bg-cream px-3 py-2 sm:static sm:mx-0 sm:gap-3 sm:border-0 sm:p-0"
          onSubmit={event => {
            event.preventDefault();
            submitSearch(searchQuery);
          }}>
          <a href="/" aria-label="Back from search" onClick={event => {
            if (document.referrer && new URL(document.referrer).origin === window.location.origin
              && new URL(document.referrer).pathname.replace(/\/?$/, '/') !== '/search/') {
              event.preventDefault();
              window.history.back();
            }
          }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-cocoa focus-visible:outline-2 sm:hidden">
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 5-7 7 7 7M5 12h15" /></svg>
          </a>
          <label className="min-w-0 flex-1 sm:space-y-2">
            <span className="sr-only font-semibold sm:not-sr-only sm:block">Search products</span>
            <input ref={searchInputRef} type="search" name="q" value={searchQuery} placeholder="Try keychain, gajra or bunny"
              enterKeyHint="search" aria-describedby="search-help"
              onChange={event => setSearchQuery(event.target.value)}
              className="min-h-11 w-full rounded-xl border-2 border-mustard bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-mustard" />
          </label>
          {searchQuery && <button type="button" aria-label="Clear search" onClick={() => {
            setSearchQuery('');
            const url = new URL(window.location.href);
            url.searchParams.delete('q');
            window.history.replaceState(window.history.state, '', url);
            searchInputRef.current?.focus();
          }} className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-sm underline">
            <span className="sm:hidden" aria-hidden="true">×</span><span className="hidden sm:inline">Clear search</span>
          </button>}
        </form>
        {searchHistoryError && <p role="status" className="text-sm text-cocoa/80">{searchHistoryError}</p>}
        {!searchTerm && recentSearches.length > 0 && <section aria-labelledby="recent-searches-heading" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 id="recent-searches-heading" className="font-heading text-xl font-bold">Recent searches</h2>
            <button type="button" onClick={() => updateRecentSearches([])} className="min-h-11 px-2 text-sm underline">Clear all searches</button>
          </div>
          <p className="text-xs text-cocoa/70">Saved only in this browser on this device.</p>
          <ul className="divide-y divide-mustard/30">
            {recentSearches.map(term => <li key={term} className="flex items-center gap-2">
              <button type="button" onClick={() => { submitSearch(term); searchInputRef.current?.focus(); }}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2 text-left">
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0"><path d="M3 5v5h5M3 10a9 9 0 1 1 2 8M12 7v5l3 2" /></svg>
                <span className="truncate">{term}</span>
              </button>
              <button type="button" aria-label={`Remove recent search: ${term}`}
                onClick={() => updateRecentSearches(recentSearches.filter(value => value !== term))}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl">×</button>
            </li>)}
          </ul>
        </section>}
        <p id="search-help" className="text-sm text-cocoa/70">Results update as you type. Press Enter to save a shareable search URL.</p>
        {!searchTerm && <p>Search for a product to see matching results.</p>}
        {showCatalogue && searchTerm && <><p role="status">{searchProducts.length} {searchProducts.length === 1 ? 'product' : 'products'} found for "{searchTerm}"</p>
          {searchProducts.length === 0 ? <p>No matching products. Try a different name, category or colour.</p> :
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {searchProducts.map((product, index) => <li key={product.id}>
                <ProductCard product={product} isFirstProduct={index === 0}
                  onSelect={selected => window.location.assign(toProductPageUrl(selected))}
                  onAddToCart={onAddToCart} isCartBusy={isCartBusy || isLoading || Boolean(loadError)}
                  cartQuantity={getCartQuantity(product.id)} />
              </li>)}
            </ul>}
        </>}
      </> : productCollection ? <>
        <p className="max-w-3xl">{productCollection.description}</p>
        {requestedPath === '/bestsellers/' && bestsellers.error && <CatalogueNotice message={bestsellers.error} onRetry={bestsellers.retry} />}
        {requestedPath === '/bestsellers/' && bestsellers.isLoading && <p role="status">Checking the latest bestsellers…</p>}
        {showCatalogue && curatedProducts.length === 0 && !loadError &&
          (requestedPath !== '/bestsellers/' || (!bestsellers.isLoading && !bestsellers.error)) && <p>{productCollection.empty}</p>}
        {showCatalogue && <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {curatedProducts.map((product, index) => <li key={product.id}>
            <ProductCard product={product} isFirstProduct={index === 0}
              onSelect={selected => window.location.assign(toProductPageUrl(selected))}
              onAddToCart={onAddToCart} isCartBusy={isCartBusy || isLoading || Boolean(loadError)}
              cartQuantity={getCartQuantity(product.id)} />
          </li>)}
        </ul>}
        <nav aria-label="More products" className="flex flex-wrap gap-4">
          <a href="/#products" className="min-h-11 underline">Shop all products</a>
          {productCollections.filter(item => item.path !== requestedPath).map(item =>
            <a key={item.path} href={item.path} className="min-h-11 underline">{item.title}</a>)}
        </nav>
      </> : isInternationalQuote ? <InternationalQuote products={products} isLoading={isLoading} loadError={loadError} onRefresh={onRetry} /> : isBulkOrders ? <BulkOrders presentation="page" /> : isAbout ? <section className="grid items-start gap-6 leading-relaxed lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-8">
        <article aria-label="Luvia's founder story" className="space-y-6 rounded-2xl border border-mustard/30 bg-white/70 p-5 sm:p-8">
          <figure className="mx-auto w-full max-w-[240px]">
            <img {...productImageProtection} src={storeContent.brandStory.portrait.src} alt={storeContent.brandStory.portrait.alt}
              width={storeContent.brandStory.portrait.width} height={storeContent.brandStory.portrait.height}
              className="w-full rounded-2xl" decoding="async" />
            <figcaption className="mt-2 text-center text-sm font-semibold">{storeContent.brandStory.founderNote.signature}<span className="block font-normal">{storeContent.brandStory.founderNote.role}</span></figcaption>
          </figure>
          <p className="font-heading text-xl font-semibold sm:text-2xl">{storeContent.brandStory.subtitle}</p>
          <p>{storeContent.brandStory.intro}</p>
          {storeContent.brandStory.sections.map(section => <section key={section.title} className="space-y-3">
            <h2 className="font-heading text-xl font-bold">{section.title}</h2>
            {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          </section>)}
          <section aria-labelledby="founder-note-title" className="space-y-3 rounded-xl border-l-4 border-mustard bg-cream p-5">
            <h2 id="founder-note-title" className="font-heading text-xl font-bold">{storeContent.brandStory.founderNote.title}</h2>
            <p>{storeContent.brandStory.founderNote.text}</p>
            <p className="font-semibold">{storeContent.brandStory.founderNote.signature}<span className="block text-sm font-normal">{storeContent.brandStory.founderNote.role}</span></p>
            <a href={storeContent.brandStory.linkedinUrl} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">{storeContent.brandStory.linkedinLabel}</a>
          </section>
          <p className="border-l-4 border-mustard pl-4 font-semibold">{storeContent.brandStory.closing}</p>
          <a href="/collections/" className="inline-flex min-h-11 items-center rounded-full bg-cocoa px-5 py-3 font-semibold text-cream">{storeContent.brandStory.shopLabel}</a>
        </article>
        <div className="min-w-0 space-y-6 lg:rounded-2xl lg:border lg:border-mustard/30 lg:bg-white/70 lg:p-6">
        <h2 className="font-heading text-xl font-bold">Thoughtfully crafted crochet, made to be treasured</h2>
        <p>{storeContent.about[0]}</p><p>{storeContent.about[1]}</p>
        <h2 className="font-heading text-xl font-bold">Personal touches, confirmed with you</h2><p>{storeContent.about[2]}</p>
        <section aria-labelledby="contact-luvia" className="overflow-hidden rounded-2xl border border-mustard/40 bg-cream/70">
          <div className="p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cocoa/65">We'd love to hear from you</p>
            <h2 id="contact-luvia" className="mt-2 scroll-mt-24 font-heading text-2xl font-bold">Contact Luvia</h2>
            <p className="mt-1 text-sm text-cocoa/75">Gurugram, Haryana, India</p>
            <a href={getGeneralWhatsAppLink()} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-cocoa px-5 py-3 text-center font-semibold text-cream hover:bg-cocoa-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa">
              <WhatsAppIcon /> Ask us on WhatsApp
            </a>
            <p className="mt-2 text-center text-sm">WhatsApp / mobile: <a href={getGeneralWhatsAppLink()} className="inline-flex min-h-11 items-center underline underline-offset-4">{formatWhatsAppNumber()}</a></p>
          </div>
          <div className="space-y-3 border-t border-cocoa/10 bg-white/70 p-5">
            <p className="flex items-start gap-3">
              <MailIcon className="mt-1 h-5 w-5 shrink-0 text-cocoa/65" />
              <span className="min-w-0 text-sm"><span className="block font-semibold">Orders</span><a href="mailto:orders@luviacreations.com" className="inline-flex min-h-11 items-center break-all underline underline-offset-4">orders@luviacreations.com</a></span>
            </p>
            <p className="flex items-start gap-3">
              <MailIcon className="mt-1 h-5 w-5 shrink-0 text-cocoa/65" />
              <span className="min-w-0 text-sm"><span className="block font-semibold">General enquiries</span><a href="mailto:hello@luviacreations.com" className="inline-flex min-h-11 items-center break-all underline underline-offset-4">hello@luviacreations.com</a></span>
            </p>
            <a href="https://www.instagram.com/luvia.craftedwithlove/" className="inline-flex min-h-11 items-center gap-3 text-sm font-semibold underline underline-offset-4">
              <InstagramIcon className="h-5 w-5 shrink-0 text-cocoa/65" /> Follow Luvia on Instagram
            </a>
            <p className="border-t border-cocoa/10 pt-2 text-sm">Questions about ordering? <a href="/faq/#faq-ordering" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Read our FAQ</a>.</p>
          </div>
        </section>
        </div>
      </section> : pathname.startsWith('/faq') ? <section className="space-y-10">
        <div className="rounded-3xl border border-mustard/40 bg-mustard/10 p-5 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cocoa/65">Good to know</p>
          <h2 className="mt-3 font-heading text-2xl font-bold sm:text-3xl">Little questions, clear answers</h2>
          <p className="mt-3 max-w-2xl leading-relaxed">From your first pick to caring for your handmade piece, find the details that help you order with confidence.</p>
          <nav aria-label="FAQ topics" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {storeContent.faqGroups.map(group => <a key={group.id} href={`#${group.id}`}
              className="rounded-2xl border border-cocoa/10 bg-white p-4 transition-colors hover:border-cocoa/40">
              <span aria-hidden="true" className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-mustard/20 text-cocoa">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <path d={group.iconPath} />
                </svg>
              </span>
              <strong className="block font-heading text-lg">{group.title}</strong>
              <span className="mt-2 block text-xs leading-relaxed text-cocoa/65">{group.description}</span>
              <span aria-hidden="true" className="mt-3 block">&rarr;</span>
            </a>)}
          </nav>
        </div>
        {storeContent.faqGroups.map(group => <section key={group.id} id={group.id} aria-labelledby={`${group.id}-title`}
          className="grid scroll-mt-24 gap-4 md:grid-cols-[0.7fr_1.3fr] md:gap-8">
          <div>
            <h2 id={`${group.id}-title`} className="font-heading text-2xl font-bold">{group.title}</h2>
            <p className="mt-2 text-sm text-cocoa/65">{group.description}</p>
          </div>
          <div className="space-y-3">
            {group.questionIds.map(id => {
              const entry = storeContent.questions.find(([question]) => faqAnchors[question] === id);
              if (!entry) throw new Error(`Unknown FAQ question: ${id}`);
              return <details key={entry[0]} id={id}
                className="scroll-mt-24 rounded-2xl border border-cocoa/10 bg-white px-5">
                <summary className="cursor-pointer py-4 font-semibold marker:text-cocoa/50">{entry[0]}</summary>
                <p className="pb-5 text-sm leading-relaxed text-cocoa/85">{entry[1]}</p>
                {id === 'track-order' && <p className="flex flex-wrap gap-4 pb-5 text-sm font-semibold">
                  <a href="/?account=orders" className="inline-flex min-h-11 items-center underline">My orders</a>
                  <a href="/about/" className="inline-flex min-h-11 items-center underline">Contact us</a>
                </p>}
              </details>;
             })}
            {group.id === 'faq-care' && <details id="returns-refunds" className="scroll-mt-24 rounded-2xl border border-cocoa/10 bg-white px-5">
              <summary className="cursor-pointer py-4 font-semibold marker:text-cocoa/50">What is the return and refund policy?</summary>
              <p className="pb-5 text-sm leading-relaxed text-cocoa/85">Read our <a href="/return-policy/" className="underline">return and refund policy</a> before ordering. Contact us if you need clarification about your order.</p>
            </details>}
          </div>
        </section>)}
        <aside className="flex flex-wrap items-center justify-between gap-5 rounded-3xl bg-cocoa p-5 text-cream sm:p-7">
          <div>
            <h2 className="font-heading text-xl font-bold">Still have a little question?</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed">For a personal request or a detail about your order, get in touch before ordering. We will help you confirm what is possible.</p>
          </div>
          <nav aria-label="More ordering help" className="flex flex-wrap gap-4 text-sm font-semibold">
            <a href="/about/#contact-luvia" className="inline-flex min-h-11 items-center underline underline-offset-4">Contact Luvia</a>
            <a href={internationalQuote.path} className="inline-flex min-h-11 items-center underline underline-offset-4">Request an international quote</a>
          </nav>
        </aside>
      </section> : isCollection ? <>
        {showCatalogue && !category ? <p role="alert">This collection is no longer available. Explore the current collections below.</p> : <>
          <p className="max-w-3xl">{description}</p>
          {category && <CategoryShareButton key={category} category={category} imageUrl={collectionShareImageUrl} />}
          {showCatalogue && selectedCategory && collectionProducts.length > 0 &&
            <CategoryLook key={`${category}:${selectedCategory.coverImage}`} category={selectedCategory} products={collectionProducts} />}
          {showCatalogue && collectionProducts.length === 0 && <p>No published products in this collection yet.</p>}
          {showCatalogue && collectionProducts.length > 0 && <section
            aria-label="Filter collection products by price"
            className="flex flex-wrap items-center gap-3 rounded-xl border border-mustard/30 bg-white/70 p-3">
            <h2 className="font-semibold">Filter by price</h2>
            <PriceFilter key={`${category}:${activePriceRange?.minimum ?? ''}:${activePriceRange?.maximum ?? ''}`}
              active={activePriceRange} bands={collectionPriceBands} onApply={setActivePriceRange} />
            <p role="status" className="text-sm text-cocoa/70">
              Showing {filteredCollectionProducts.length} of {collectionProducts.length} products
            </p>
          </section>}
          {showCatalogue && filteredCollectionProducts.length === 0 && collectionProducts.length > 0 && <p role="status">
            No products match this price range.
          </p>}
          {showCatalogue && <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCollectionProducts.map((product, index) => <li key={product.id}>
              <ProductCard product={product} isFirstProduct={index === 0}
                onSelect={selected => window.location.assign(toProductPageUrl(selected))}
                onAddToCart={onAddToCart} isCartBusy={isCartBusy || isLoading || Boolean(loadError)}
                cartQuantity={getCartQuantity(product.id)} />
            </li>)}
          </ul>}
        </>}
      </> : isCustomerLove || isStory ? showCatalogue && visibleCategories.length > 0 && <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">Explore collections</h2>
        <CollectionGrid categories={visibleCategories} products={products} />
      </section> : <><p>Discover handmade crochet gifts, accessories, toys and decor by collection. Open a product to see its photos, options and current availability.</p>
        <a href="/#products" className="inline-block rounded-full bg-cocoa px-5 py-3 font-semibold text-cream">Shop all products</a>
        {showCatalogue && <CollectionGrid categories={visibleCategories} products={products} />}
        {showCatalogue && visibleCategories.length === 0 && <p>No collections are available yet.</p>}</>}
      {showCatalogue && visibleCategories.length > 0 && !isCollectionsHub && !isCustomerLove && !isStory && !policy && !isArtisans && !isGiftGuide && !article && !pathname.startsWith('/faq') && <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">Explore collections</h2>
        <p className="text-sm text-cocoa/75">Discover handmade crochet gifts and accessories by category.</p>
        {categoryLinks}
        <a href="/collections/" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">View all collections</a>
      </section>}
    </main><Footer showCollaboration={!isArtisans} showBulkOrders={!isArtisans && !isBulkOrders} />
  </div>;
}
