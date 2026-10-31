import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { requestPageReload } from './utils/pageReload';
import Header from './components/Header';
import Footer from './components/Footer';
import ProductMakingVideo from './components/ProductMakingVideo';
import OrderingGuide from './components/OrderingGuide';
import storeContent from './content/storeContent.json';
import { productImageProtection } from './utils/imageProtection';
import RelatedProducts from './components/RelatedProducts';
import Bestsellers from './components/Bestsellers';
import ProductCarousel from './components/ProductCarousel';
import { getFeaturedProducts, productCollections } from './utils/productCollections.js';
import CategoryTiles from './components/CategoryTiles';
import ProductDetailPreview from './components/ProductDetailPreview';
import StorePages from './components/StorePages';
import { isStorePage } from './utils/storePageRoute';
import CategoryFilter from './components/CategoryFilter';
import PriceFilter from './components/PriceFilter';
import MobileCatalogueFilters from './components/MobileCatalogueFilters';
import SearchBar from './components/SearchBar';
import ProductGrid from './components/ProductGrid';
import CartDrawer from './components/CartDrawer';
import CartCaptcha from './components/CartCaptcha';
import CartNotice from './components/CartNotice';
import BackToTopButton from './components/BackToTopButton';
import { useCart } from './hooks/useCart';
import { useCustomerName } from './hooks/useCustomerName';
import { isPasswordRecoveryLink } from './utils/authLinks';
import { useCatalogueProducts } from './hooks/useCatalogueProducts';
import CatalogueNotice from './components/CatalogueNotice';
import { useTickerMessages } from './hooks/useTickerMessages';
import { trackEvent, trackProductSelected, trackWhatsAppCart } from './services/analytics';
import type { CatalogueFilter, Product } from './types/product';
import { isProductNew } from './utils/productStatus';
import { compareCatalogueProducts } from './utils/catalogueSort';
import { compareCategorySettings, getSeasonalAnnouncement, matchesCategory, resolveCategorySelection } from './utils/categorySelection';
import { getCategoryShareImageUrl } from './utils/categoryShare';
import {
  findProductByReference,
  readProductReferenceFromHash,
  readProductPageReference,
  readProductVariantReference,
  toProductVariantPageUrl,
  toProductPageUrl,
  toProductReference,
  toProductHash,
  findProductVariantByReference,
  toPublicVariantSlug,
  toPublicProductSlug,
} from './utils/productLink';
import { matchesProductSearch } from './utils/productSearch';
import {
  getCataloguePriceBands,
  matchesCataloguePriceRange,
  type CataloguePriceBand,
  type CataloguePriceRange,
} from './utils/cataloguePrice';
import { getProductMetaDescription } from './utils/productMetaDescription';
import { collectionPath } from './utils/collectionLink.js';
import { reloadWithFreshAssets } from './utils/chunkLoadRecovery';

const AdminPage = lazy(() => import('./components/admin/AdminPage'));
const ProductModal = lazy(() => import('./components/ProductModal'));
const CustomerOrders = lazy(() => import('./components/CustomerOrders'));
const AccountDialog = lazy(() => import('./components/AccountDialog'));
const FeedbackForm = lazy(() => import('./components/FeedbackForm'));
const readCheckoutStep = () => {
  const value = new URLSearchParams(window.location.search).get('checkout');
  return (['cart','delivery','review','confirmation'] as const).find(step => step === value) ?? null;
};
const sectionHashes = ['#collaborate', '#bulk-orders', '#products'];

function App() {
  const watchReference = window.location.pathname.match(/^\/watch\/([^/]+)\/?$/)?.[1];
  const { products, categorySettings, isLoading, loadError, refreshProducts, hasCatalogueSnapshot, homepageMetadata, initialBestsellerIds } =
    useCatalogueProducts();
  const [isAdminPage, setIsAdminPage] = useState(window.location.hash === '#admin');
  const [checkoutStep, setCheckoutStep] = useState(readCheckoutStep);
  const [isCartOpen, setCartOpen] = useState(() => Boolean(readCheckoutStep()));
  const [chunkLoadFailed, setChunkLoadFailed] = useState(false);
  const navigateCheckout = useCallback((step: 'cart' | 'delivery' | 'review' | 'confirmation', requestId?: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('checkout', step);
    if (step === 'confirmation' && requestId) url.searchParams.set('checkoutRequest', requestId);
    else url.searchParams.delete('checkoutRequest');
    if (readCheckoutStep() !== step) {
      const state = window.history.state;
      window.history.pushState(typeof state?.catalogueDepth === 'number'
        ? { ...state, catalogueDepth: state.catalogueDepth + 1 } : state, '', url);
    }
    setCheckoutStep(step); setCartOpen(true);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);
  const setIsCartOpen = useCallback((open: boolean) => {
    if (open) {
      navigateCheckout('cart');
    } else {
      if (readCheckoutStep()) {
        const url = new URL(window.location.href);
        url.searchParams.delete('checkout');
        url.searchParams.delete('checkoutRequest');
        const state = window.history.state;
        window.history.pushState(typeof state?.catalogueDepth === 'number'
          ? { ...state, catalogueDepth: state.catalogueDepth + 1 } : state, '', url);
      }
      setCheckoutStep(null); setCartOpen(false);
    }
  }, [navigateCheckout]);
  const [accountMode, setAccountMode] = useState<'signin' | 'signup' | 'reset' | null>(
    () => (isPasswordRecoveryLink(window.location.hash) ? 'reset' : null));
  const openAccount = useCallback((mode: 'signin' | 'signup') => { setIsCartOpen(false); setAccountMode(mode); }, [setIsCartOpen]);
  const closeAccount = useCallback(() => setAccountMode(null), []);
  const openOrders = useCallback(() => {
    window.location.assign(`${import.meta.env.BASE_URL}?account=orders`);
  }, []);
  const customerName = useCustomerName();
  const cart = useCart(!isAdminPage);
  const tickerMessages = useTickerMessages(!isAdminPage);

  // Registered once for the whole app so both the shop and admin console
  // (see AdminPage.tsx) are installable as home-screen apps. With autoUpdate,
  // a new deploy activates and reloads the page; requestPageReload defers that
  // while the install dialog is open.
  useRegisterSW({ immediate: true, onNeedReload: requestPageReload });

  useEffect(() => {
    const showRecovery = () => setChunkLoadFailed(true);
    window.addEventListener('vite:preloadErrorExhausted', showRecovery);
    return () => window.removeEventListener('vite:preloadErrorExhausted', showRecovery);
  }, []);

  useEffect(() => {
    const updateRoute = () => setIsAdminPage(window.location.hash === '#admin');
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  const categories = useMemo(() => {
    return [...categorySettings].sort(compareCategorySettings)
      .filter(category => category.visible !== false && products.some(product => matchesCategory(product, category.name, categorySettings)))
      .map((category) => category.name)
  }, [categorySettings, products]);
  const seasonalAnnouncement = getSeasonalAnnouncement(categorySettings, products);

  const [activeCategory, setActiveCategory] = useState<CatalogueFilter>(() =>
    new URLSearchParams(window.location.search).get('category') || 'All');
  const [activePriceRange, setActivePriceRange] = useState<CataloguePriceRange | null>(null);
  const [query, setQuery] = useState('');
  const [selectedProductSnapshot, setSelectedProduct] = useState<Product | null>(() => {
    const reference = readProductPageReference() ?? readProductReferenceFromHash();
    return hasCatalogueSnapshot && reference ? findProductByReference(products, reference) : null;
  });
  const selectedProduct = !isLoading && selectedProductSnapshot
    ? products.find(product => product.id === selectedProductSnapshot.id) ?? null
    : selectedProductSnapshot;
  const [pageReference, setPageReference] = useState(readProductPageReference);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(() =>
    readProductVariantReference());
  const [catalogueTime, setCatalogueTime] = useState(Date.now);
  const [categoryScrollRequest, setCategoryScrollRequest] = useState(0);
  const pendingProductReference = useRef(readProductPageReference() ?? readProductReferenceFromHash());
  const promotedFromCatalogue = useRef(false);
  const productReturnScrollY = useRef<number | null>(null);
  const catalogueToolsRef = useRef<HTMLDivElement>(null);
  const productGridRef = useRef<HTMLDivElement>(null);
  const initialMetadata = useRef({
    title: document.title,
    canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
    description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content,
    socialDescriptions: Array.from(document.querySelectorAll<HTMLMetaElement>(
      'meta[property="og:description"], meta[name="twitter:description"]',
    )).map((element) => ({ element, content: element.content })),
  });

  useEffect(() => {
    const timer = window.setInterval(() => setCatalogueTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const hasNewProducts = useMemo(
    () => products.some((product) => isProductNew(product, catalogueTime)),
    [products, catalogueTime],
  );

  // Fall back to "All" during render (rather than in an effect) when the "New"
  // filter is active but no longer has any matching products.
  const effectiveActiveCategory: CatalogueFilter =
    (activeCategory === 'New' && !hasNewProducts)
      || (activeCategory !== 'All' && activeCategory !== 'New' && !categories.includes(activeCategory))
      ? 'All' : activeCategory;
  const activeCategoryShareImageUrl = useMemo(
    () => getCategoryShareImageUrl(effectiveActiveCategory, products, categorySettings),
    [categorySettings, effectiveActiveCategory, products],
  );
  const categoryProducts = useMemo(
    () => products.filter((product) =>
      effectiveActiveCategory === 'All'
      || (effectiveActiveCategory === 'New'
        ? isProductNew(product, catalogueTime)
        : matchesCategory(product, effectiveActiveCategory, categorySettings)),
    ),
    [effectiveActiveCategory, catalogueTime, categorySettings, products],
  );
  const priceBands = useMemo(() => getCataloguePriceBands(categoryProducts), [categoryProducts]);
  const priceBandsByCategory = useMemo(() => {
    const filters: CatalogueFilter[] = ['All', ...(hasNewProducts ? ['New'] : []), ...categories];
    return new Map<CatalogueFilter, CataloguePriceBand[]>(filters.map(category => {
      const matchingProducts = products.filter(product =>
        category === 'All'
        || (category === 'New'
          ? isProductNew(product, catalogueTime)
          : matchesCategory(product, category, categorySettings)),
      );
      return [category, getCataloguePriceBands(matchingProducts)];
    }));
  }, [categories, hasNewProducts, catalogueTime, categorySettings, products]);

  // Campaign links such as #product=rose-charm--<id> open the advertised product
  // as soon as the catalogue has loaded.
  useEffect(() => {
    const reference = pendingProductReference.current;
    if (!reference || products.length === 0 || isLoading) return;
    const match = findProductByReference(products, reference);
    if (!match) return;
    pendingProductReference.current = null;
    trackProductSelected(match);
    // eslint-disable-next-line react/set-state-in-effect -- syncs the opened product with the incoming URL
    setSelectedProduct(match);
  }, [isLoading, products]);

  useEffect(() => {
    if (isAdminPage || isCartOpen || pendingProductReference.current || pageReference) return;
    // The lazy auth client must consume email-link credentials before route cleanup.
    const authParams = new URLSearchParams(window.location.hash.slice(1));
    if (authParams.has('access_token') || authParams.has('error_description')) return;
    if (/^\/artisans\/?$/.test(window.location.pathname) && authParams.has('invite')) return;
    const { pathname, search } = window.location;
    const hash = selectedProduct ? toProductHash(selectedProduct)
      : sectionHashes.includes(window.location.hash) ? window.location.hash : '';
    window.history.replaceState(null, '', `${pathname}${search}${hash}`);
  }, [isAdminPage, isCartOpen, selectedProduct, pageReference]);

  useEffect(() => {
    if (isLoading || isCartOpen || isAdminPage || (selectedProduct && !pageReference)) return;
    let frame = 0;
    const scrollToSection = () => {
      window.cancelAnimationFrame(frame);
      if (!sectionHashes.includes(window.location.hash)) return;
      const id = window.location.hash.slice(1);
      frame = window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' }));
    };
    // Native fragment scrolling can run before React mounts or the catalogue fills the page.
    scrollToSection();
    window.addEventListener('hashchange', scrollToSection);
    window.addEventListener('popstate', scrollToSection);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', scrollToSection);
      window.removeEventListener('popstate', scrollToSection);
    };
  }, [isLoading, isCartOpen, isAdminPage, pageReference, selectedProduct]);

  useEffect(() => {
    if (!pageReference || !selectedProduct) return;
    const url = new URL(toProductPageUrl(selectedProduct));
    if (window.location.hash === '#making-video' || sectionHashes.includes(window.location.hash)) url.hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    params.delete('productPage');
    const incomingVariant = readProductVariantReference();
    const resolvedVariant = incomingVariant
      ? findProductVariantByReference(selectedProduct, incomingVariant)
      : undefined;
    const isVariantPath = /\/variant\/[^/]+\/?$/.test(window.location.pathname);
    if (resolvedVariant && isVariantPath) {
      url.pathname = new URL(toProductVariantPageUrl(selectedProduct, resolvedVariant)).pathname;
      params.delete('variant');
    } else if (resolvedVariant) params.set('variant', toPublicVariantSlug(resolvedVariant));
    url.search = params.toString();
    window.history.replaceState(window.history.state, '', url);
    document.title = `${selectedProduct.name} | Luvia Creations`;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = resolvedVariant && isVariantPath
      ? toProductVariantPageUrl(selectedProduct, resolvedVariant) : toProductPageUrl(selectedProduct);
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const summary = getProductMetaDescription(selectedProduct);
    if (description) description.content = summary;
    for (const { element } of initialMetadata.current.socialDescriptions) element.content = summary;
  }, [pageReference, selectedProduct]);

  const restoreHomepageMetadata = useCallback(() => {
    if (/^\/artisans\/?$/.test(window.location.pathname)) return;
    document.title = homepageMetadata?.title ?? initialMetadata.current.title;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = homepageMetadata?.canonical ?? initialMetadata.current.canonical ?? import.meta.env.BASE_URL;
    const summary = homepageMetadata?.description ?? initialMetadata.current.description;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description && summary) description.content = summary;
    for (const element of document.querySelectorAll<HTMLMetaElement>('meta[property="og:description"], meta[name="twitter:description"]')) {
      element.content = homepageMetadata?.description ??
        initialMetadata.current.socialDescriptions.find(item => item.element === element)?.content ?? '';
    }
  }, [homepageMetadata]);

  const navigateCatalogue = (category?: string) => {
    window.history.pushState(null, '', `${import.meta.env.BASE_URL}${category ? `?category=${encodeURIComponent(category)}` : ''}`);
    pendingProductReference.current = null;
    promotedFromCatalogue.current = false;
    productReturnScrollY.current = null;
    setPageReference(null);
    setSelectedProduct(null);
    setSelectedVariantId(null);
    const checkout = readCheckoutStep();
    setCheckoutStep(checkout);
    setCartOpen(Boolean(checkout));
    setActiveCategory(category ?? 'All');
    setQuery('');
    restoreHomepageMetadata();
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  useEffect(() => {
    const onPopState = () => {
      const reference = readProductPageReference();
      setPageReference(reference);
      setActiveCategory(new URLSearchParams(window.location.search).get('category') || 'All');
      const checkout = readCheckoutStep();
      setCheckoutStep(checkout);
      setCartOpen(Boolean(checkout));
      setSelectedVariantId(readProductVariantReference());
      const requested = reference ?? readProductReferenceFromHash();
      setSelectedProduct(requested && !isLoading ? findProductByReference(products, requested) : null);
      pendingProductReference.current = requested && (isLoading || products.length === 0) ? requested : null;
      if (!reference) {
        restoreHomepageMetadata();
        if (!sectionHashes.includes(window.location.hash)) {
          window.requestAnimationFrame(() => window.scrollTo({ top: productReturnScrollY.current ?? 0, behavior: 'auto' }));
        }
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [products, isLoading, restoreHomepageMetadata]);

  // Opens the product when a link lands in an already-loaded tab, where the
  // browser only changes the hash instead of reloading the page.
  useEffect(() => {
    const openProductFromHash = () => {
      if (pageReference) return;
      const reference = readProductReferenceFromHash();
      if (!reference) return;
      const match = findProductByReference(products, reference);
      if (!match || match.id === selectedProduct?.id) return;
      trackProductSelected(match);
      setSelectedProduct(match);
    };
    window.addEventListener('hashchange', openProductFromHash);
    return () => window.removeEventListener('hashchange', openProductFromHash);
  }, [products, selectedProduct, pageReference]);

  const openFullDetails = (variantId: string) => {
    if (!selectedProduct) return;
    const url = new URL(toProductPageUrl(selectedProduct));
    const params = new URLSearchParams(window.location.search);
    params.delete('productPage');
    const variant = selectedProduct.variants.find((item) => item.id === variantId);
    if (variant) params.set('variant', toPublicVariantSlug(variant));
    url.search = params.toString();
    promotedFromCatalogue.current = true;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    window.history.pushState({ catalogueDepth: 1 }, '', url);
    setSelectedVariantId(variantId || null);
    setPageReference(toProductReference(selectedProduct));
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const openRelatedProduct = (product: Product) => {
    trackProductSelected(product);
    const url = new URL(toProductPageUrl(product));
    const params = new URLSearchParams(window.location.search);
    params.delete('variant');
    params.delete('productPage');
    url.search = params.toString();
    const depth = window.history.state?.catalogueDepth;
    window.history.pushState(
      promotedFromCatalogue.current
        ? { ...window.history.state, catalogueDepth: typeof depth === 'number' ? depth + 1 : 1 }
        : null,
      '', url,
    );
    setSelectedProduct(product);
    setSelectedVariantId(null);
    setPageReference(toProductReference(product));
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const selectProduct = (product: Product) => {
    trackProductSelected(product);
    productReturnScrollY.current = window.scrollY;
    setSelectedVariantId(null);
    setSelectedProduct(product);
    const url = new URL(toProductPageUrl(product));
    url.search = window.location.search;
    url.searchParams.delete('variant');
    url.searchParams.delete('productPage');
    promotedFromCatalogue.current = true;
    window.history.pushState({ catalogueDepth: 1 }, '', url);
    setPageReference(toProductReference(product));
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const closeSelectedProduct = () => {
    setSelectedProduct(null);
    setSelectedVariantId(null);
    const returnScrollY = productReturnScrollY.current;
    productReturnScrollY.current = null;
    if (returnScrollY !== null) {
      window.requestAnimationFrame(() => window.scrollTo({ top: returnScrollY, behavior: 'auto' }));
    }
  };

  // Tapping the active category again clears the filter, so users can get
  // back to the full catalogue without hunting for the "All" chip.
  const selectCategory = (category: CatalogueFilter, toggleCurrent = true) => {
    const next = toggleCurrent
      ? resolveCategorySelection(category, effectiveActiveCategory)
      : category;
    trackEvent('select_category', { category: next });
    if (activePriceRange && !products.some((product) => {
      const matchesNextCategory =
        next === 'All'
        || (next === 'New'
          ? isProductNew(product, catalogueTime)
          : matchesCategory(product, next, categorySettings));
      return matchesNextCategory && matchesCataloguePriceRange(product, activePriceRange);
    })) {
      setActivePriceRange(null);
    }
    const url = new URL(window.location.href);
    if (url.searchParams.has('category')) {
      if (next === 'All') url.searchParams.delete('category');
      else url.searchParams.set('category', next);
      window.history.replaceState(window.history.state, '', url);
    }
    setActiveCategory(next);
    setCategoryScrollRequest((current) => current + 1);
  };
  const applyCatalogueFilters = (category: CatalogueFilter, range: CataloguePriceRange | null) => {
    selectCategory(category, false);
    setActivePriceRange(range);
  };

  const filteredProducts = useMemo(() => {
    const categoryRanks = new Map(
      categorySettings.map((category, index) => [
        category.name,
        category.priority * 1000 + index,
      ]),
    );
    return categoryProducts
      .filter((product) => {
        const matchesQuery = matchesProductSearch(product, query);
        return matchesQuery && matchesCataloguePriceRange(product, activePriceRange);
      })
      .sort((left, right) =>
        compareCatalogueProducts(left, right, { now: catalogueTime, categoryRanks }),
      );
  }, [categoryProducts, catalogueTime, categorySettings, query, activePriceRange]);

  useEffect(() => {
    if (categoryScrollRequest === 0 || isLoading) return;
    const frame = window.requestAnimationFrame(() => {
      const productGrid = productGridRef.current;
      if (!productGrid) return;
      const stickyOffset =
        window.innerWidth < 640
          ? 61 + 12
          : (catalogueToolsRef.current?.offsetHeight ?? 0) + 16;
      const top = productGrid.getBoundingClientRect().top + window.scrollY - stickyOffset;
      window.scrollTo({
        top: Math.max(0, top),
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [categoryScrollRequest, isLoading]);

  const selectedProductIndex = selectedProduct
    ? filteredProducts.findIndex((product) => product.id === selectedProduct.id)
    : -1;

  const showPreviousProduct = () => {
    if (filteredProducts.length <= 1 || selectedProductIndex === -1) return;
    const previousIndex =
      selectedProductIndex === 0 ? filteredProducts.length - 1 : selectedProductIndex - 1;
    setSelectedProduct(filteredProducts[previousIndex]);
    setSelectedVariantId(null);
  };

  const showNextProduct = () => {
    if (filteredProducts.length <= 1 || selectedProductIndex === -1) return;
    const nextIndex =
      selectedProductIndex === filteredProducts.length - 1 ? 0 : selectedProductIndex + 1;
    setSelectedProduct(filteredProducts[nextIndex]);
    setSelectedVariantId(null);
  };

  if (isAdminPage) {
    return (
      <>
        <CartCaptcha />
        <Suspense fallback={<p role="status">Loading admin console…</p>}>
          <AdminPage onProductPublished={refreshProducts} />
        </Suspense>
        <BackToTopButton />
      </>
    );
  }

  const cartNotifications = <>
      <CartCaptcha />
      {chunkLoadFailed && <div role="alert" className="fixed left-1/2 top-24 z-[130] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 shadow-lg">
        <p>The page could not load an app update. Please reload to try again.</p>
        <button type="button" onClick={reloadWithFreshAssets}
          className="mt-3 min-h-11 rounded-full bg-cocoa px-5 py-2 font-semibold text-cream">
          Reload page
        </button>
      </div>}
      {cart.error && !isCartOpen && (
        <div className="fixed left-1/2 top-24 z-[120] w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <CartNotice message={cart.error} onDismiss={cart.dismissError} />
        </div>
      )}
      {cart.addFeedback && (
        <div role="status" aria-live="polite"
          className="fixed left-1/2 top-24 z-[90] -translate-x-1/2 rounded-full bg-emerald-700 px-4 py-2 text-center text-sm font-bold text-white shadow-lg">
          ✓ {cart.addFeedback}
        </div>
      )}
  </>;

  const cartDrawer = isCartOpen && (
    <CartDrawer
      accountName={customerName}
      onCreateAccount={() => setAccountMode('signup')}
      pageStep={checkoutStep ?? 'cart'}
      confirmationRequest={checkoutStep === 'confirmation' ? new URLSearchParams(window.location.search).get('checkoutRequest') ?? undefined : undefined}
      onNavigateStep={navigateCheckout}
      onPaymentConfirmed={() => { void cart.refresh(); }}
      cart={cart.cart}
      products={products}
      isLoading={cart.isLoading}
      isBusy={cart.isBusy}
      error={cart.error}
      onClose={() => setIsCartOpen(false)}
      onUpdateQuantity={(itemId, quantity, minimumQuantity) => {
        void cart.updateQuantity(itemId, quantity, minimumQuantity);
      }}
      onRemove={(itemId) => {
        void cart.removeItem(itemId);
      }}
      onClear={() => {
        void cart.clear();
      }}
      onWhatsAppStarted={() => {
        if (cart.cart) trackWhatsAppCart(cart.cart);
        void cart.markWhatsAppStarted();
      }}
      onSaveDeliveryPin={cart.saveDeliveryPin}
      onSaveDeliveryDetails={cart.saveDeliveryDetails}
      onSelectWelcomeCoupon={cart.selectWelcomeCoupon}
      onEmailStarted={() => {
        trackEvent('email_cart', {
          item_count: cart.itemCount,
        });
      }}
      onOpenProduct={(productId, variantId) => {
        const product = products.find((candidate) => candidate.id === productId);
        if (!product) return;
        if (isStorePage() || watchReference) {
          const url = new URL(toProductPageUrl(product));
          const variant = product.variants.find((item) => item.id === variantId);
          if (variant) url.searchParams.set('variant', toPublicVariantSlug(variant));
          window.location.assign(url);
          return;
        }
        trackProductSelected(product);
        productReturnScrollY.current = null;
        setSelectedVariantId(variantId);
        setSelectedProduct(product);
        const url = new URL(toProductPageUrl(product));
        url.search = window.location.search;
        url.searchParams.delete('checkout');
        url.searchParams.delete('checkoutRequest');
        url.searchParams.delete('variant');
        const variant = product.variants.find((item) => item.id === variantId);
        if (variant) url.searchParams.set('variant', toPublicVariantSlug(variant));
        promotedFromCatalogue.current = true;
        window.history.pushState({ catalogueDepth: 1, returnToCheckout: true }, '', url);
        setPageReference(toProductReference(product));
        setCheckoutStep(null); setCartOpen(false);
        window.scrollTo({ top: 0, behavior: 'auto' });
      }}
    />
  );

  const accountDialog = accountMode && (
    <Suspense fallback={null}>
      <AccountDialog mode={accountMode} accountName={customerName} onClose={closeAccount} />
    </Suspense>
  );

  if (new URLSearchParams(window.location.search).get('page') === 'feedback' && !isCartOpen) {
    return <div className="flex min-h-screen flex-col bg-cream">
      {cartNotifications}
      <Header compact alignLogoLeft showHeading={false} showInstallPrompt={false} categories={categories}
        seasonalCategories={categorySettings.filter(item => item.isSeasonal).map(item => item.name)}
        cartItemCount={cart.itemCount} cartUpdateCount={cart.cartUpdateCount} onOpenCart={() => setIsCartOpen(true)}
        onOpenAccount={openAccount} onOpenOrders={openOrders} accountName={customerName} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-6 sm:py-10">
        <a href={import.meta.env.BASE_URL} className="inline-flex min-h-11 items-center text-sm text-cocoa underline underline-offset-4">Back to shop</a>
        <div>
          <p className="text-sm font-semibold text-cocoa/70">Made with love. Better with your ideas.</p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-cocoa">Share feedback</h1>
        </div>
        <Suspense fallback={<p role="status" className="text-cocoa">Loading feedback form...</p>}>
          <FeedbackForm />
        </Suspense>
      </main>
      <Footer /><BackToTopButton />{accountDialog}
    </div>;
  }

  if (new URLSearchParams(window.location.search).get('account') === 'orders' && !isCartOpen) {
    return <div className="flex min-h-screen flex-col bg-cream">
      {cartNotifications}
      <Header compact alignLogoLeft showHeading={false} showInstallPrompt={false} categories={categories}
        seasonalCategories={categorySettings.filter(item => item.isSeasonal).map(item => item.name)}
        cartItemCount={cart.itemCount} onOpenCart={() => setIsCartOpen(true)}
        onOpenAccount={openAccount} onOpenOrders={openOrders} accountName={customerName} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <a href={import.meta.env.BASE_URL} className="inline-block min-h-11 underline">Back to shop</a>
        <h1 className="font-heading text-3xl font-bold text-cocoa">My orders</h1>
        <p className="mt-2 text-sm text-cocoa/70">Confirmed, processing and shipped orders appear first. Reorder available items at current prices; payment is never taken automatically.</p>
        {customerName ? <Suspense fallback={<p role="status">Loading orders...</p>}>
          <CustomerOrders key={customerName} onReorder={cart.reorderOrder} onOpenCart={() => setIsCartOpen(true)} />
        </Suspense> : <div className="mt-4">
          <p>Sign in with your verified account to view your orders.</p>
          <button type="button" onClick={() => openAccount('signin')} className="mt-3 min-h-11 rounded-full bg-cocoa px-4 py-2 text-cream">Sign in to view orders</button>
        </div>}
      </main>
      <Footer /><BackToTopButton />{accountDialog}
    </div>;
  }
  if (isCartOpen) {
    return <div className="flex min-h-screen flex-col bg-cream">
      {cartNotifications}
      <Header compact alignLogoLeft showHeading={false} showInstallPrompt={false}
        showCollaborationLink={false}
        seasonalAnnouncement={seasonalAnnouncement}
        seasonalCategories={categorySettings.filter(item => item.isSeasonal).map(item => item.name)}
        cartItemCount={cart.itemCount} cartUpdateCount={cart.cartUpdateCount}
        onOpenCart={() => setIsCartOpen(true)} onOpenAccount={openAccount} onOpenOrders={openOrders} accountName={customerName} />
      <main className="w-full flex-1">{cartDrawer}</main>
      <Footer showCollaboration={false} />
      <BackToTopButton />
      {accountDialog}
    </div>;
  }

  if (isStorePage()) {
    return <>
      {cartNotifications}
      <StorePages products={products} categorySettings={categorySettings} isLoading={isLoading}
        initialBestsellerIds={initialBestsellerIds}
        loadError={loadError} hasCatalogueSnapshot={hasCatalogueSnapshot} onRetry={refreshProducts}
        onAddToCart={async (product, variant) => Boolean(await cart.addItem(product, variant))}
        isCartBusy={cart.isBusy} getCartQuantity={productId => cart.cart?.items
          .filter(item => item.productId === productId).reduce((total, item) => total + item.quantity, 0) ?? 0}
        cartItemCount={cart.itemCount} cartUpdateCount={cart.cartUpdateCount}
        onOpenCart={() => setIsCartOpen(true)} onOpenAccount={openAccount} onOpenOrders={openOrders} accountName={customerName} />
      <BackToTopButton />
      {cartDrawer}
      {accountDialog}
    </>;
  }

  return (
    <div className={`min-h-screen flex flex-col ${pageReference && selectedProduct ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]' : ''}`}>
      {cartNotifications}
      <Header
        compact={Boolean(pageReference || watchReference)}
        alignLogoLeft={Boolean(pageReference || watchReference)}
        showHeading={!pageReference && !watchReference}
        showInstallPrompt={!pageReference && !watchReference}
        cartItemCount={cart.itemCount}
        cartUpdateCount={cart.cartUpdateCount}
        onOpenCart={() => setIsCartOpen(true)}
        tickerMessages={tickerMessages}
        seasonalAnnouncement={seasonalAnnouncement}
        seasonalCategories={categorySettings.filter(item => item.isSeasonal).map(item => item.name)}
        categories={categories}
        onNavigateCatalogue={watchReference ? undefined : navigateCatalogue}
        mobileSearchAction={!pageReference && !watchReference && <MobileCatalogueFilters presentation="icon"
          activeCategory={effectiveActiveCategory} activePriceRange={activePriceRange} categories={categories}
          seasonalCategories={categorySettings.filter(item => item.isSeasonal).map(item => item.name)}
          showNew={hasNewProducts} priceBands={priceBands} priceBandsByCategory={priceBandsByCategory}
          onApplyFilters={applyCatalogueFilters} onSelectCategory={selectCategory} onApplyPriceRange={setActivePriceRange} />}
        onOpenAccount={openAccount}
        onOpenOrders={openOrders}
        accountName={customerName}
      />
      {watchReference ? (
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-4 sm:py-8">
          {(() => {
            const product = products.find(item => toPublicProductSlug(item) === watchReference);
            if (!product?.makingVideo) return <CatalogueNotice
              message={isLoading ? 'Loading making video...' : loadError || 'This making video is no longer available.'}
              onRetry={refreshProducts} />;
            return <>
              <h1 className="font-heading text-2xl font-bold text-cocoa sm:text-3xl">
                {product.makingVideo.title?.trim() || `Making ${product.name}`}
              </h1>
              <ProductMakingVideo key={product.makingVideo.videoUrl} product={product} />
              <p className="text-cocoa">Watch {product.name} being made by Luvia Creations.
                A behind-the-scenes look at our handmade crochet work.</p>
              <a href={toProductPageUrl(product)} className="inline-block py-2 font-semibold text-cocoa underline">
                View {product.name} — photos, options and ordering
              </a>
            </>;
          })()}
        </main>
      ) : pageReference ? (
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-4 sm:py-8">
          <a
            href={import.meta.env.BASE_URL}
            onClick={(event) => {
              if (!promotedFromCatalogue.current || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              const depth = window.history.state?.catalogueDepth;
              window.history.go(-(typeof depth === 'number' ? depth : 1));
            }}
            className="inline-block py-2 text-sm font-semibold text-cocoa underline underline-offset-4"
          >
            {window.history.state?.returnToCheckout ? 'Back to cart' : 'Back to collection'}
          </a>
          {!selectedProduct && (
            isLoading
              ? <p role="status">Loading product details…</p>
              : loadError ? <CatalogueNotice message={loadError} onRetry={refreshProducts} />
                : <p role="alert" className="rounded-xl border border-mustard/30 bg-white p-4 text-cocoa">
                  This product is unavailable or no longer published. Browse the collection for available items.
                </p>
          )}
          {selectedProduct && (
            <nav aria-label="Breadcrumb" className="text-sm text-cocoa">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <li>
                  <a href={import.meta.env.BASE_URL} className="underline underline-offset-4">Home</a>
                </li>
                <li aria-hidden="true">/</li>
                <li>
                  <a
                    href={collectionPath(selectedProduct.category)}
                    className="underline underline-offset-4"
                  >
                    {selectedProduct.category}
                  </a>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="min-w-0 break-words font-semibold">
                  {selectedProduct.name}
                </li>
              </ol>
            </nav>
          )}
          {selectedProduct && (
            <Suspense fallback={<ProductDetailPreview product={selectedProduct} variantReference={selectedVariantId ?? undefined} />}>
              <ProductModal
                key={`page:${selectedProduct.id}:${selectedVariantId ?? ''}`}
                presentation="page"
                product={selectedProduct}
                initialVariantId={selectedVariantId ?? undefined}
                currentIndex={0}
                totalProducts={1}
                onClose={() => {}}
                onPrevious={() => {}}
                onNext={() => {}}
                onAddToCart={async (product, variant) => Boolean(await cart.addItem(product, variant))}
                isCartBusy={cart.isBusy || isLoading}
                getCartQuantity={(productId, variantId) => cart.cart?.items.find(item => item.productId === productId && item.variantId === variantId)?.quantity ?? 0}
                getCartItem={(productId, variantId) => cart.cart?.items.find(item => item.productId === productId && item.variantId === variantId)}
                onUpdateCartItem={async (itemId, quantity, minimumQuantity) =>
                  Boolean(await cart.updateQuantity(itemId, quantity, minimumQuantity))}
                onRemoveCartItem={async (itemId) => Boolean(await cart.removeItem(itemId))}
              />
            </Suspense>
          )}
          {selectedProduct && (
            <RelatedProducts product={selectedProduct} products={products} onSelect={openRelatedProduct} />
          )}
          {loadError && selectedProduct && <CatalogueNotice message={loadError} onRetry={refreshProducts} />}
          <OrderingGuide />
        </main>
      ) : (
      <main className="max-w-6xl w-full mx-auto px-4 py-3 sm:py-8 flex-1 space-y-3 sm:space-y-6">
        {effectiveActiveCategory === 'All' && !query.trim() && <section aria-labelledby="brand-story-teaser-title" className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-x-4 gap-y-2 rounded-2xl border border-mustard/40 bg-white/70 p-4 text-cocoa sm:grid-cols-[128px_minmax(0,1fr)] sm:p-6">
          <img {...productImageProtection} src={storeContent.brandStory.portrait.thumbnail} alt={storeContent.brandStory.portrait.alt} width={150} height={200}
            className="row-span-2 w-full rounded-xl sm:row-span-4" decoding="async" />
          <p className="text-xs font-semibold uppercase tracking-wider">Meet Luvia &amp; our founder</p>
          <h2 id="brand-story-teaser-title" className="font-heading text-xl font-bold sm:text-2xl">{storeContent.brandStory.teaser.title}</h2>
          <p className="col-span-2 text-sm leading-relaxed sm:col-span-1 sm:col-start-2">{storeContent.brandStory.teaser.text}</p>
          <a href="/about/" className="col-span-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4 sm:col-span-1 sm:col-start-2">{storeContent.brandStory.teaser.linkLabel}</a>
        </section>}
        {categories.length > 0 && (!isLoading || hasCatalogueSnapshot) && effectiveActiveCategory === 'All' && !query.trim() &&
          <CategoryTiles categories={categories} products={products} categorySettings={categorySettings} />}
        {effectiveActiveCategory === 'All' && !query.trim() && <Bestsellers products={products} initialIds={initialBestsellerIds} onSelect={selectProduct} />}
        {effectiveActiveCategory === 'All' && !query.trim() && <ProductCarousel products={getFeaturedProducts(products)}
          onSelect={selectProduct} title={productCollections[1].title} label="featured product"
          viewAll={productCollections[1].path} description={productCollections[1].description} />}
          <div
            ref={catalogueToolsRef}
            className="space-y-3 sm:sticky sm:top-0 sm:z-30 sm:-mx-4 sm:border-b sm:border-mustard/30 sm:bg-cream/95 sm:px-4 sm:py-3 sm:backdrop-blur-md"
          >
            <div className="hidden sm:block"><SearchBar
              value={query}
              onChange={setQuery}
              onSearch={(searchQuery) =>
                trackEvent('catalogue_search', {
                  query_length: searchQuery.trim().length,
                  result_count: filteredProducts.length,
                })
              }
            /></div>
            <div className="flex items-center justify-center gap-2">
              <MobileCatalogueFilters presentation="chips" activeCategory={effectiveActiveCategory}
                activePriceRange={activePriceRange} categories={categories}
                seasonalCategories={categorySettings.filter(item => item.isSeasonal).map(item => item.name)}
                showNew={hasNewProducts} priceBands={priceBands}
                priceBandsByCategory={priceBandsByCategory}
                onApplyFilters={applyCatalogueFilters}
                onSelectCategory={selectCategory} onApplyPriceRange={setActivePriceRange} />
              <div className="hidden flex-wrap items-center justify-center gap-2 sm:flex">
                <CategoryFilter
                  categories={categories}
                  seasonalCategories={categorySettings.filter(item => item.isSeasonal).map(item => item.name)}
                  active={effectiveActiveCategory}
                  onSelect={selectCategory}
                  showNew={hasNewProducts}
                  compactOnMobile
                  collapseCategories
                  shareImageUrl={activeCategoryShareImageUrl}
                />
                <PriceFilter key={`${activePriceRange?.minimum ?? ''}:${activePriceRange?.maximum ?? ''}`}
                  active={activePriceRange} bands={priceBands} onApply={setActivePriceRange} />
                {(effectiveActiveCategory !== 'All' || activePriceRange !== null) && <button type="button"
                  onClick={() => {
                    selectCategory('All', false);
                    setActivePriceRange(null);
                  }}
                  className="min-h-11 rounded-full border border-cocoa/25 bg-white px-3 text-sm font-semibold text-cocoa">
                  Clear filters ×
                </button>}
              </div>
            </div>
          </div>
        <div id="products" className="scroll-mt-[73px] text-center sm:scroll-mt-40">
          <h2 className="font-heading text-2xl md:text-3xl font-bold text-cocoa">
            Shop the Collection
          </h2>
          <p className="mt-1 text-xs text-cocoa/80 sm:text-sm">
            Add your favourites to the cart, review delivery and pay securely through Razorpay.
          </p>
        </div>
        {loadError && (
          <CatalogueNotice message={loadError} onRetry={refreshProducts} />
        )}
        <div ref={productGridRef}>
          {isLoading && !hasCatalogueSnapshot ? (
            <p className="py-16 text-center text-cocoa/60">Loading the catalogue…</p>
          ) : (
            <ProductGrid
              products={filteredProducts}
              onSelect={selectProduct}
              onAddToCart={async (product, variant) =>
                Boolean(await cart.addItem(product, variant))
              }
              isCartBusy={cart.isBusy || isLoading}
              getCartQuantity={(productId, variantId) =>
                cart.cart?.items.find(
                  (item) => item.productId === productId && item.variantId === variantId,
                )?.quantity ?? 0
              }
            />
          )}
        </div>
        <OrderingGuide />
      </main>
      )}

      <Footer />
      {(!selectedProduct || pageReference) && <BackToTopButton raised={Boolean(pageReference && selectedProduct)} />}

      {selectedProduct && !pageReference && (
        <Suspense fallback={<p role="status">Loading product details…</p>}>
          <ProductModal
            key={`${selectedProduct.id}:${selectedVariantId ?? ''}`}
            product={selectedProduct}
            initialVariantId={selectedVariantId ?? undefined}
            currentIndex={selectedProductIndex}
            totalProducts={filteredProducts.length}
            onClose={closeSelectedProduct}
            onPrevious={showPreviousProduct}
            onNext={showNextProduct}
            onOpenFullDetails={openFullDetails}
            onAddToCart={async (product, variant) => Boolean(await cart.addItem(product, variant))}
            isCartBusy={cart.isBusy || isLoading}
            getCartQuantity={(productId, variantId) =>
              cart.cart?.items.find(
                (item) => item.productId === productId && item.variantId === variantId,
              )?.quantity ?? 0
            }
            getCartItem={(productId, variantId) =>
              cart.cart?.items.find(
                (item) => item.productId === productId && item.variantId === variantId,
              )
            }
            onUpdateCartItem={async (itemId, quantity, minimumQuantity) =>
              Boolean(await cart.updateQuantity(itemId, quantity, minimumQuantity))
            }
            onRemoveCartItem={async (itemId) => Boolean(await cart.removeItem(itemId))}
          />
        </Suspense>
      )}
      {cartDrawer}
      {accountDialog}
    </div>
  );
}

export default App;
