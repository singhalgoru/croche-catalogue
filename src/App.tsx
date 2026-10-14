import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { requestPageReload } from './utils/pageReload';
import Header from './components/Header';
import Footer from './components/Footer';
import OrderingGuide from './components/OrderingGuide';
import RelatedProducts from './components/RelatedProducts';
import Bestsellers from './components/Bestsellers';
import CategoryTiles from './components/CategoryTiles';
import ProductDetailPreview from './components/ProductDetailPreview';
import StorePages from './components/StorePages';
import { isStorePage } from './utils/storePageRoute';
import CategoryFilter from './components/CategoryFilter';
import PriceFilter from './components/PriceFilter';
import MobileCatalogueFilters from './components/MobileCatalogueFilters';
import CartMenuButton from './components/CartMenuButton';
import BrandMark from './components/BrandMark';
import SearchBar from './components/SearchBar';
import ProductGrid from './components/ProductGrid';
import CartDrawer from './components/CartDrawer';
import CartCaptcha from './components/CartCaptcha';
import BackToTopButton from './components/BackToTopButton';
import { useCart } from './hooks/useCart';
import { useCustomerName } from './hooks/useCustomerName';
import { isPasswordRecoveryLink } from './utils/authLinks';
import { useCatalogueProducts } from './hooks/useCatalogueProducts';
import { useTickerMessages } from './hooks/useTickerMessages';
import { trackEvent, trackProductSelected, trackWhatsAppCart } from './services/analytics';
import type { CatalogueFilter, Product } from './types/product';
import { isProductNew } from './utils/productStatus';
import { compareCatalogueProducts } from './utils/catalogueSort';
import { compareCategorySettings, getSeasonalAnnouncement, matchesCategory, resolveCategorySelection } from './utils/categorySelection';
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

const AdminPage = lazy(() => import('./components/admin/AdminPage'));
const ProductModal = lazy(() => import('./components/ProductModal'));
const CustomerOrders = lazy(() => import('./components/CustomerOrders'));
const AccountDialog = lazy(() => import('./components/AccountDialog'));
const FeedbackForm = lazy(() => import('./components/FeedbackForm'));
const readCheckoutStep = () => {
  const value = new URLSearchParams(window.location.search).get('checkout');
  return (['cart','delivery','review','confirmation'] as const).find(step => step === value) ?? null;
};

function App() {
  const { products, categorySettings, isLoading, loadError, refreshProducts, hasCatalogueSnapshot, homepageMetadata, initialBestsellerIds } =
    useCatalogueProducts();
  const [isAdminPage, setIsAdminPage] = useState(window.location.hash === '#admin');
  const [checkoutStep, setCheckoutStep] = useState(readCheckoutStep);
  const [isCartOpen, setCartOpen] = useState(() => Boolean(readCheckoutStep()));
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
  const [returnToCartOnProductClose, setReturnToCartOnProductClose] = useState(false);
  const cart = useCart(!isAdminPage);
  const tickerMessages = useTickerMessages(!isAdminPage);

  // Registered once for the whole app so both the shop and admin console
  // (see AdminPage.tsx) are installable as home-screen apps. With autoUpdate,
  // a new deploy activates and reloads the page; requestPageReload defers that
  // while the install dialog is open.
  useRegisterSW({ immediate: true, onNeedReload: requestPageReload });

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
  const [areCatalogueToolsSticky, setAreCatalogueToolsSticky] = useState(false);
  const [catalogueToolsHeight, setCatalogueToolsHeight] = useState(0);
  const pendingProductReference = useRef(readProductPageReference() ?? readProductReferenceFromHash());
  const promotedFromCatalogue = useRef(false);
  const productReturnScrollY = useRef<number | null>(null);
  const catalogueToolsSentinelRef = useRef<HTMLDivElement>(null);
  const catalogueToolsRef = useRef<HTMLDivElement>(null);
  const stickyCatalogueToolsRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const tools = catalogueToolsRef.current;
    if (!tools) return;
    const observer = new ResizeObserver(() => setCatalogueToolsHeight(tools.offsetHeight));
    setCatalogueToolsHeight(tools.offsetHeight);
    observer.observe(tools);
    return () => observer.disconnect();
  }, [areCatalogueToolsSticky, pageReference]);

  useEffect(() => {
    const updateStickyState = () => {
      const sentinel = catalogueToolsSentinelRef.current;
      setAreCatalogueToolsSticky(
        Boolean(
          window.innerWidth < 640 &&
            sentinel &&
            sentinel.getBoundingClientRect().top < 0,
        ),
      );
    };
    updateStickyState();
    window.addEventListener('scroll', updateStickyState, { passive: true });
    window.addEventListener('resize', updateStickyState);
    return () => {
      window.removeEventListener('scroll', updateStickyState);
      window.removeEventListener('resize', updateStickyState);
    };
  }, []);

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
    const { pathname, search } = window.location;
    const hash = selectedProduct ? toProductHash(selectedProduct)
      : window.location.hash === '#collaborate' ? '#collaborate' : '';
    window.history.replaceState(null, '', `${pathname}${search}${hash}`);
  }, [isAdminPage, isCartOpen, selectedProduct, pageReference]);

  useEffect(() => {
    if (!pageReference || !selectedProduct) return;
    const url = new URL(toProductPageUrl(selectedProduct));
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
    setReturnToCartOnProductClose(false);
    setActiveCategory(category ?? 'All');
    setQuery('');
    restoreHomepageMetadata();
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  useEffect(() => {
    const onPopState = () => {
      if (window.location.hash === '#collaborate') return;
      const reference = readProductPageReference();
      setPageReference(reference);
      setActiveCategory(new URLSearchParams(window.location.search).get('category') || 'All');
      const checkout = readCheckoutStep();
      setCheckoutStep(checkout);
      setCartOpen(Boolean(checkout));
      setReturnToCartOnProductClose(false);
      setSelectedVariantId(readProductVariantReference());
      const requested = reference ?? readProductReferenceFromHash();
      setSelectedProduct(requested && !isLoading ? findProductByReference(products, requested) : null);
      pendingProductReference.current = requested && (isLoading || products.length === 0) ? requested : null;
      if (!reference) {
        restoreHomepageMetadata();
        window.requestAnimationFrame(() => window.scrollTo({ top: productReturnScrollY.current ?? 0, behavior: 'auto' }));
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
    setAreCatalogueToolsSticky(false);
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
    setReturnToCartOnProductClose(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const selectProduct = (product: Product) => {
    trackProductSelected(product);
    productReturnScrollY.current = window.scrollY;
    setReturnToCartOnProductClose(false);
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
    if (returnToCartOnProductClose) {
      setReturnToCartOnProductClose(false);
      setIsCartOpen(true);
      return;
    }
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
          ? (stickyCatalogueToolsRef.current?.offsetHeight ?? 112) + 12
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
      </>
    );
  }

  const cartNotifications = <>
      <CartCaptcha />
      {cart.error && !isCartOpen && (
        <div role="alert" className="fixed left-1/2 top-24 z-[120] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 shadow-lg">
          <p className="min-w-0 flex-1">{cart.error}</p>
          <button type="button" onClick={cart.dismissError} aria-label="Dismiss cart error"
            className="min-h-11 shrink-0 px-3 underline">Dismiss</button>
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
        if (isStorePage()) {
          const url = new URL(toProductPageUrl(product));
          const variant = product.variants.find((item) => item.id === variantId);
          if (variant) url.searchParams.set('variant', toPublicVariantSlug(variant));
          window.location.assign(url);
          return;
        }
        trackProductSelected(product);
        productReturnScrollY.current = null;
        setReturnToCartOnProductClose(false);
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
      <Footer />{accountDialog}
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
      <Footer />{accountDialog}
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
      {accountDialog}
    </div>;
  }

  if (isStorePage()) {
    return <>
      {cartNotifications}
      <StorePages products={products} categorySettings={categorySettings} isLoading={isLoading}
        loadError={loadError} hasCatalogueSnapshot={hasCatalogueSnapshot}
        onAddToCart={async (product, variant) => Boolean(await cart.addItem(product, variant))}
        isCartBusy={cart.isBusy} getCartQuantity={productId => cart.cart?.items
          .filter(item => item.productId === productId).reduce((total, item) => total + item.quantity, 0) ?? 0}
        cartItemCount={cart.itemCount} cartUpdateCount={cart.cartUpdateCount}
        onOpenCart={() => setIsCartOpen(true)} onOpenAccount={openAccount} onOpenOrders={openOrders} accountName={customerName} />
      {cartDrawer}
      {accountDialog}
    </>;
  }

  return (
    <div className={`min-h-screen flex flex-col ${pageReference && selectedProduct ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]' : ''}`}>
      {cartNotifications}
      <Header
        compact={Boolean(pageReference)}
        alignLogoLeft={Boolean(pageReference)}
        showHeading={!pageReference}
        showInstallPrompt={!pageReference}
        cartItemCount={cart.itemCount}
        cartUpdateCount={cart.cartUpdateCount}
        onOpenCart={() => setIsCartOpen(true)}
        mobileCartInToolbar={!pageReference}
        hideMobileCart={!pageReference && areCatalogueToolsSticky}
        tickerMessages={tickerMessages}
        seasonalAnnouncement={seasonalAnnouncement}
        seasonalCategories={categorySettings.filter(item => item.isSeasonal).map(item => item.name)}
        categories={categories}
        onNavigateCatalogue={navigateCatalogue}
        onOpenAccount={openAccount}
        onOpenOrders={openOrders}
        accountName={customerName}
      />
      {pageReference ? (
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
              : <p role="alert" className="rounded-xl border border-mustard/30 bg-white p-4 text-cocoa">
                {loadError || 'This product is unavailable or no longer published. Browse the collection for available items.'}
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
          {loadError && selectedProduct && <p role="alert" className="text-sm text-red-700">{loadError}</p>}
          <OrderingGuide />
        </main>
      ) : (
      <main className="max-w-6xl w-full mx-auto px-4 py-3 sm:py-8 flex-1 space-y-3 sm:space-y-6">
        {categories.length > 0 && (!isLoading || hasCatalogueSnapshot) && effectiveActiveCategory === 'All' && !query.trim() &&
          <CategoryTiles categories={categories} products={products} categorySettings={categorySettings} />}
        {effectiveActiveCategory === 'All' && !query.trim() && <Bestsellers products={products} initialIds={initialBestsellerIds} onSelect={selectProduct} />}
        <div ref={catalogueToolsSentinelRef} className="h-px" aria-hidden="true" />
        {areCatalogueToolsSticky ? (
          <div style={{ height: catalogueToolsHeight }} aria-hidden="true" />
        ) : (
          <div
            ref={catalogueToolsRef}
            className="space-y-3 sm:sticky sm:top-0 sm:z-30 sm:-mx-4 sm:border-b sm:border-mustard/30 sm:bg-cream/95 sm:px-4 sm:py-3 sm:backdrop-blur-md"
          >
            <SearchBar
              value={query}
              onChange={setQuery}
              onSearch={(searchQuery) =>
                trackEvent('catalogue_search', {
                  query_length: searchQuery.trim().length,
                  result_count: filteredProducts.length,
                })
              }
            />
            <div className="flex items-center justify-center gap-2">
              <MobileCatalogueFilters activeCategory={effectiveActiveCategory}
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
                />
                <PriceFilter key={`${activePriceRange?.minimum ?? ''}:${activePriceRange?.maximum ?? ''}`}
                  active={activePriceRange} bands={priceBands} onApply={setActivePriceRange} />
              </div>
            </div>
          </div>
        )}
        {areCatalogueToolsSticky && (
          <div
            ref={stickyCatalogueToolsRef}
            className="fixed inset-x-0 top-0 z-40 space-y-3 border-b border-mustard/30 bg-cream/95 px-4 py-3 shadow-sm backdrop-blur-md sm:hidden"
          >
            <div className="flex items-center gap-2">
              <BrandMark className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <SearchBar
                  value={query}
                  onChange={setQuery}
                  onSearch={(searchQuery) =>
                    trackEvent('catalogue_search', {
                      query_length: searchQuery.trim().length,
                      result_count: filteredProducts.length,
                    })
                  }
                />
              </div>
              <CartMenuButton itemCount={cart.itemCount} updateCount={cart.cartUpdateCount} onClick={() => setIsCartOpen(true)} />
            </div>
            <MobileCatalogueFilters activeCategory={effectiveActiveCategory}
              activePriceRange={activePriceRange} categories={categories}
              seasonalCategories={categorySettings.filter(item => item.isSeasonal).map(item => item.name)}
              showNew={hasNewProducts} priceBands={priceBands}
              priceBandsByCategory={priceBandsByCategory}
              onApplyFilters={applyCatalogueFilters}
              onSelectCategory={selectCategory} onApplyPriceRange={setActivePriceRange} />
          </div>
        )}
        <div className="text-center">
          <h2 className="font-heading text-2xl md:text-3xl font-bold text-cocoa">
            Shop the Collection
          </h2>
          <p className="mt-1 text-xs text-cocoa/80 sm:text-sm">
            Add your favourites to the cart, review delivery and pay securely through Razorpay.
          </p>
        </div>
        {loadError && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
            {loadError}
          </p>
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
      {!selectedProduct && !isCartOpen && <BackToTopButton />}

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
