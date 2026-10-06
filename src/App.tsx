import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { requestPageReload } from './utils/pageReload';
import Header from './components/Header';
import Footer from './components/Footer';
import OrderingGuide from './components/OrderingGuide';
import RelatedProducts from './components/RelatedProducts';
import ProductDetailPreview from './components/ProductDetailPreview';
import StorePages from './components/StorePages';
import { isStorePage } from './utils/storePageRoute';
import { collectionPath } from './utils/collectionLink.js';
import CategoryFilter from './components/CategoryFilter';
import CartMenuButton from './components/CartMenuButton';
import BrandMark from './components/BrandMark';
import SearchBar from './components/SearchBar';
import ProductGrid from './components/ProductGrid';
import CartDrawer from './components/CartDrawer';
import BackToTopButton from './components/BackToTopButton';
import { useCart } from './hooks/useCart';
import { useCatalogueProducts } from './hooks/useCatalogueProducts';
import { useTickerMessages } from './hooks/useTickerMessages';
import { trackEvent, trackProductSelected } from './services/analytics';
import type { CatalogueFilter, Product } from './types/product';
import { isProductNew } from './utils/productStatus';
import { compareCatalogueProducts } from './utils/catalogueSort';
import { resolveCategorySelection } from './utils/categorySelection';
import {
  findProductByReference,
  readProductReferenceFromHash,
  readProductPageReference,
  toProductPageUrl,
  toProductReference,
  toProductHash,
  findProductVariantByReference,
  toPublicVariantSlug,
} from './utils/productLink';
import { matchesProductSearch } from './utils/productSearch';
import { getProductMetaDescription } from './utils/productMetaDescription';

const AdminPage = lazy(() => import('./components/admin/AdminPage'));
const ProductModal = lazy(() => import('./components/ProductModal'));

function App() {
  const { products, categorySettings, isLoading, loadError, refreshProducts, hasCatalogueSnapshot, homepageMetadata } =
    useCatalogueProducts();
  const [isAdminPage, setIsAdminPage] = useState(window.location.hash === '#admin');
  const [isCartOpen, setIsCartOpen] = useState(false);
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
    const populatedCategories = new Set(products.map((product) => product.category));
    return categorySettings
      .map((category) => category.name)
      .filter((category) => populatedCategories.has(category));
  }, [categorySettings, products]);

  const [activeCategory, setActiveCategory] = useState<CatalogueFilter>(() =>
    new URLSearchParams(window.location.search).get('category') || 'All');
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
    new URLSearchParams(window.location.search).get('variant'));
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
    if (isAdminPage || pendingProductReference.current || pageReference) return;
    const { pathname, search } = window.location;
    const hash = selectedProduct ? toProductHash(selectedProduct) : '';
    window.history.replaceState(null, '', `${pathname}${search}${hash}`);
  }, [isAdminPage, selectedProduct, pageReference]);

  useEffect(() => {
    if (!pageReference || !selectedProduct) return;
    const url = new URL(toProductPageUrl(selectedProduct));
    const params = new URLSearchParams(window.location.search);
    params.delete('productPage');
    const incomingVariant = params.get('variant');
    const resolvedVariant = incomingVariant
      ? findProductVariantByReference(selectedProduct, incomingVariant)
      : undefined;
    if (resolvedVariant) params.set('variant', toPublicVariantSlug(resolvedVariant));
    url.search = params.toString();
    window.history.replaceState(window.history.state, '', url);
    document.title = `${selectedProduct.name} | Luvia Creations`;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = toProductPageUrl(selectedProduct);
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
    setIsCartOpen(false);
    setReturnToCartOnProductClose(false);
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
      setIsCartOpen(false);
      setReturnToCartOnProductClose(false);
      setSelectedVariantId(new URLSearchParams(window.location.search).get('variant'));
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
        ? { catalogueDepth: typeof depth === 'number' ? depth + 1 : 1 }
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
  const selectCategory = (category: CatalogueFilter) => {
    const next = resolveCategorySelection(category, effectiveActiveCategory);
    trackEvent('select_category', { category: next });
    const url = new URL(window.location.href);
    if (url.searchParams.has('category')) {
      if (next === 'All') url.searchParams.delete('category');
      else url.searchParams.set('category', next);
      window.history.replaceState(window.history.state, '', url);
    }
    setActiveCategory(next);
    setCategoryScrollRequest((current) => current + 1);
  };

  const filteredProducts = useMemo(() => {
    const categoryRanks = new Map(
      categorySettings.map((category, index) => [
        category.name,
        category.priority * 1000 + index,
      ]),
    );
    return products
      .filter((product) => {
        const matchesCategory =
          effectiveActiveCategory === 'All' ||
          (effectiveActiveCategory === 'New'
            ? isProductNew(product, catalogueTime)
            : product.category === effectiveActiveCategory);
        const matchesQuery = matchesProductSearch(product, query);
        return matchesCategory && matchesQuery;
      })
      .sort((left, right) =>
        compareCatalogueProducts(left, right, { now: catalogueTime, categoryRanks }),
      );
  }, [effectiveActiveCategory, catalogueTime, categorySettings, products, query]);

  useEffect(() => {
    if (categoryScrollRequest === 0 || isLoading) return;
    const frame = window.requestAnimationFrame(() => {
      const productGrid = productGridRef.current;
      if (!productGrid) return;
      const stickyOffset =
        window.innerWidth < 640
          ? (stickyCatalogueToolsRef.current?.offsetHeight ?? 112) + 12
          : 16;
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
      <Suspense fallback={<p role="status">Loading admin console…</p>}>
        <AdminPage onProductPublished={refreshProducts} />
      </Suspense>
    );
  }

  if (isStorePage()) {
    return <StorePages products={products} categorySettings={categorySettings} isLoading={isLoading}
      loadError={loadError} hasCatalogueSnapshot={hasCatalogueSnapshot} refreshProducts={refreshProducts} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
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
        categories={categories}
        onNavigateCatalogue={navigateCatalogue}
      />
      {cart.addFeedback && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-24 z-[90] -translate-x-1/2 rounded-full bg-emerald-700 px-4 py-2 text-center text-sm font-bold text-white shadow-lg"
        >
          ✓ {cart.addFeedback}
        </div>
      )}

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
            Back to collection
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
                    href={`${import.meta.env.BASE_URL}?category=${encodeURIComponent(selectedProduct.category)}`}
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
            <Suspense fallback={<ProductDetailPreview product={selectedProduct} />}>
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
                onUpdateCartItem={async (itemId, quantity) => Boolean(await cart.updateQuantity(itemId, quantity))}
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
        <div ref={catalogueToolsSentinelRef} className="h-px" aria-hidden="true" />
        {areCatalogueToolsSticky ? (
          <div style={{ height: catalogueToolsHeight }} aria-hidden="true" />
        ) : (
          <div ref={catalogueToolsRef} className="space-y-3">
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
            <CategoryFilter
              categories={categories}
              active={effectiveActiveCategory}
              onSelect={selectCategory}
              showNew={hasNewProducts}
              compactOnMobile
            />
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
            <CategoryFilter
              categories={categories}
              active={effectiveActiveCategory}
              onSelect={selectCategory}
              showNew={hasNewProducts}
              compactOnMobile
            />
          </div>
        )}
        <div className="text-center">
          <h2 className="font-heading text-2xl md:text-3xl font-bold text-cocoa">
            Shop the Collection
          </h2>
          <p className="mt-1 text-xs text-cocoa/80 sm:text-sm">
            Add your favourites to the cart, then confirm your order on WhatsApp.
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
        {categories.length > 0 && (!isLoading || hasCatalogueSnapshot) && <section className="space-y-3">
          <h2 className="font-heading text-xl font-bold text-cocoa">Explore collections</h2>
          <nav aria-label="Explore collections" className="flex flex-wrap gap-3">
            {categories.map(category => <a key={category} href={collectionPath(category)}
              className="rounded-full border border-mustard bg-mustard/20 px-4 py-2 text-sm font-semibold text-cocoa underline-offset-4 hover:underline">{category}</a>)}
          </nav>
        </section>}
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
            onUpdateCartItem={async (itemId, quantity) =>
              Boolean(await cart.updateQuantity(itemId, quantity))
            }
            onRemoveCartItem={async (itemId) => Boolean(await cart.removeItem(itemId))}
          />
        </Suspense>
      )}
      {isCartOpen && (
        <CartDrawer
          cart={cart.cart}
          products={products}
          isLoading={cart.isLoading}
          isBusy={cart.isBusy}
          error={cart.error}
          onClose={() => setIsCartOpen(false)}
          onUpdateQuantity={(itemId, quantity) => {
            void cart.updateQuantity(itemId, quantity);
          }}
          onRemove={(itemId) => {
            void cart.removeItem(itemId);
          }}
          onClear={() => {
            void cart.clear();
          }}
          onWhatsAppStarted={() => {
            void cart.markWhatsAppStarted();
          }}
          onSaveDeliveryPin={cart.saveDeliveryPin}
          onEmailStarted={() => {
            trackEvent('email_cart', {
              cart_reference: cart.cart?.reference ?? '',
              item_count: cart.cart?.items.length ?? 0,
            });
          }}
          onOpenProduct={(productId, variantId) => {
            const product = products.find((candidate) => candidate.id === productId);
            if (!product) return;
            trackProductSelected(product);
            productReturnScrollY.current = null;
            setReturnToCartOnProductClose(true);
            setSelectedVariantId(variantId);
            setSelectedProduct(product);
            if (pageReference) {
              const url = new URL(toProductPageUrl(product));
              const variant = product.variants.find((item) => item.id === variantId);
              if (variant) url.searchParams.set('variant', toPublicVariantSlug(variant));
              window.history.replaceState(window.history.state, '', url);
              setPageReference(toProductReference(product));
            }
            setIsCartOpen(false);
          }}
        />
      )}
    </div>
  );
}

export default App;
