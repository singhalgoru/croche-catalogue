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
import { productImageProtection } from '../utils/imageProtection';
import policies from '../content/policies.json';
import bulkOrders from '../content/bulkOrders.json';
import BulkOrders from './BulkOrders';
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

const ArtisanApplicationForm = lazy(() => import('./ArtisanApplicationForm'));

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
  const isAbout = requestedPath === '/about/';
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
  const description = limitCategoryOverview(selectedCategory?.overview || (category ? Object.hasOwn(descriptions, category) ? descriptions[category]
    : `Explore ${category} from Luvia Creations. View handmade designs, product details and available variants.` : ''));
  const title = productCollection?.title ?? policy?.title ?? (isArtisans ? artisanOnboarding.title : isSearch ? 'Search products' : isBulkOrders ? bulkOrders.title : isAbout ? storeContent.brandStory.title
    : pathname.startsWith('/faq') ? 'Ordering, delivery & care FAQ'
      : isCollection ? category ? `Handmade ${category}` : 'Collection unavailable'
        : 'Explore our handmade collections');

  useEffect(() => {
    const timer = window.setInterval(() => setCatalogueTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isLoading && !hasCatalogueSnapshot) return;
    document.title = `${title} | Luvia Creations`;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = `${window.location.origin}${requestedPath}`;
    if (isSearch || isArtisans) {
      const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]') ?? document.createElement('meta');
      robots.name = 'robots';
      robots.content = 'noindex,follow';
      if (!robots.isConnected) document.head.append(robots);
    }
    if (productCollection || policy || isBulkOrders || isAbout || isArtisans) {
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]')) meta.content = productCollection?.description ?? policy?.description ?? (isArtisans ? artisanOnboarding.description : isAbout ? storeContent.brandStory.description : bulkOrders.description);
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[property="og:title"], meta[name="twitter:title"]')) meta.content = document.title;
    }
    if (isCollection) {
      const summary = description || 'This collection is no longer available. Explore the current Luvia collections.';
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[property="og:image"], meta[name="twitter:image"]')) {
        if (!meta.content.startsWith(`${window.location.origin}${requestedPath}og`)) {
          meta.content = collectionShareImageUrl || `${window.location.origin}/images/luvia-logo.jpg`;
        }
      }
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]')) meta.content = summary;
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
  }, [visibleCategories, category, collectionProducts, collectionShareImageUrl, description, hasCatalogueSnapshot, incomingCollection, isAbout, isSearch, isArtisans, isBulkOrders, isCollection, isLoading, policy, requestedPath, title, productCollection, curatedProducts]);

  const categoryLinks = (
    <nav aria-label="Explore collections" className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
      {visibleCategories.map(item => <a key={item.name} href={collectionPath(item.name)}
        className={`flex min-h-11 min-w-0 items-center justify-center rounded-2xl border border-mustard px-3 py-2 text-center text-sm leading-snug underline underline-offset-4 sm:rounded-full sm:px-4 ${item.isSeasonal ? 'badge-glow bg-mustard/20' : ''}`}>{item.name}</a>)}
    </nav>
  );
  return <div className={`flex min-h-screen flex-col ${isSearch ? 'mobile-search-page' : ''}`}>
    <Header compact alignLogoLeft showHeading={false} showInstallPrompt={false} categories={showCatalogue ? visibleCategories.map(item => item.name) : []}
      seasonalAnnouncement={getSeasonalAnnouncement(categories, products)}
      seasonalCategories={categories.filter(item => item.isSeasonal).map(item => item.name)}
      cartItemCount={cartItemCount} cartUpdateCount={cartUpdateCount} onOpenCart={onOpenCart} onOpenAccount={onOpenAccount} onOpenOrders={onOpenOrders} accountName={accountName} />
    <main className={`mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 text-cocoa ${isSearch ? 'pb-6 sm:py-6' : 'py-6'}`}>
      <nav aria-label="Breadcrumb" className={`${isSearch ? 'hidden sm:flex' : 'flex'} flex-wrap gap-3 text-sm`}><a href="/" className="underline">Home</a>
        {isCollection && <a href="/collections/" className="underline">Collections</a>}<span aria-current="page">{title}</span></nav>
      <h1 className={`font-heading text-3xl font-bold ${isSearch ? 'sr-only sm:not-sr-only' : ''}`}>{title}</h1>
      {policy && <article className="max-w-3xl space-y-5">
        <p className="text-sm">Last updated: {policy.updated}</p>
        {policy.sections.map(section => <section key={section.title} className="space-y-2">
          <h2 className="font-heading text-xl font-bold">{section.title}</h2>
          <p>{section.text}</p>
        </section>)}
        <nav aria-label="Related policies" className="flex flex-wrap gap-4">
          {policies.filter(item => item.path !== policy.path).map(item =>
            <a key={item.path} href={item.path} className="min-h-11 underline">{item.title}</a>)}
          <a href="/return-policy/" className="min-h-11 underline">Return and refund policy</a>
          <a href="/about/" className="min-h-11 underline">About &amp; contact</a>
        </nav>
      </article>}
      {loadError && !isArtisans && <CatalogueNotice message={loadError} onRetry={onRetry} />}
      {isLoading && !isArtisans && <p role="status">Checking the latest collections and availability…</p>}
      {policy ? null : isArtisans ? <Suspense fallback={<p role="status">Loading application...</p>}><ArtisanApplicationForm /></Suspense> : isSearch ? <>
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
      </> : isBulkOrders ? <BulkOrders presentation="page" /> : isAbout ? <section className="grid items-start gap-6 leading-relaxed lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-8">
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
          </section>
          <p className="border-l-4 border-mustard pl-4 font-semibold">{storeContent.brandStory.closing}</p>
          <a href="/collections/" className="inline-flex min-h-11 items-center rounded-full bg-cocoa px-5 py-3 font-semibold text-cream">{storeContent.brandStory.shopLabel}</a>
        </article>
        <div className="min-w-0 space-y-6 lg:rounded-2xl lg:border lg:border-mustard/30 lg:bg-white/70 lg:p-6">
        <h2 className="font-heading text-xl font-bold">Thoughtfully crafted crochet, made to be treasured</h2>
        <p>{storeContent.about[0]}</p><p>{storeContent.about[1]}</p>
        <h2 className="font-heading text-xl font-bold">Personal touches, confirmed with you</h2><p>{storeContent.about[2]}</p>
        <h2 className="font-heading text-xl font-bold">Contact Luvia</h2>
        <p>Gurugram, Haryana, India</p>
        <a href={getGeneralWhatsAppLink()} className="inline-block rounded-full bg-cocoa px-5 py-3 font-semibold text-cream">Ask us on WhatsApp</a>
        <p>WhatsApp / mobile: <a href={getGeneralWhatsAppLink()} className="underline">{formatWhatsAppNumber()}</a></p>
        <p>Orders: <a href="mailto:orders@luviacreations.com" className="underline">orders@luviacreations.com</a></p>
        <p>General enquiries: <a href="mailto:hello@luviacreations.com" className="underline">hello@luviacreations.com</a></p>
        <a href="https://www.instagram.com/luvia.craftedwithlove/" className="inline-block underline">Follow Luvia on Instagram</a>
        <p>Questions about ordering? <a href="/faq/" className="inline-flex min-h-11 items-center underline underline-offset-4">Read our FAQ</a>.</p>
        </div>
      </section> : pathname.startsWith('/faq') ? <section className="max-w-3xl space-y-3">
        <p>Answers about ordering, custom colours, shipping across India, international enquiries, care and returns.</p>
        {storeContent.questions.map(([question, answer]) => <details key={question} className="rounded-xl border border-mustard/40 bg-white p-4">
          <summary className="cursor-pointer font-semibold">{question}</summary><p className="mt-3">{answer}</p>
        </details>)}
        <details className="rounded-xl border border-mustard/40 bg-white p-4"><summary className="cursor-pointer font-semibold">What is the return and refund policy?</summary>
          <p className="mt-3">Read our <a href="/return-policy/" className="underline">return and refund policy</a> before ordering. Contact us if you need clarification about your order.</p></details>
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
      </> : <><p>Find your favourites by collection, then open a product for photos and details.</p>
        <a href="/#products" className="inline-block rounded-full bg-cocoa px-5 py-3 font-semibold text-cream">Shop all products</a>
        {showCatalogue && <CollectionGrid categories={visibleCategories} products={products} />}
        {showCatalogue && visibleCategories.length === 0 && <p>No collections are available yet.</p>}</>}
      {showCatalogue && !isCollectionsHub && !policy && !isArtisans && <section className="space-y-3"><h2 className="font-heading text-xl font-bold">Explore collections</h2>{categoryLinks}</section>}
    </main><Footer showCollaboration={!isArtisans} showBulkOrders={!isArtisans && !isBulkOrders} />
  </div>;
}
