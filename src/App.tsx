import { useEffect, useMemo, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import Header from './components/Header';
import Footer from './components/Footer';
import CategoryFilter from './components/CategoryFilter';
import SearchBar from './components/SearchBar';
import ProductGrid from './components/ProductGrid';
import ProductModal from './components/ProductModal';
import CartDrawer from './components/CartDrawer';
import BackToTopButton from './components/BackToTopButton';
import AdminPage from './components/admin/AdminPage';
import { useCart } from './hooks/useCart';
import { useCatalogueProducts } from './hooks/useCatalogueProducts';
import { useTickerMessages } from './hooks/useTickerMessages';
import { trackEvent, trackProductSelected } from './services/analytics';
import type { CatalogueFilter, Product } from './types/product';
import { isProductNew } from './utils/productStatus';
import {
  findProductByReference,
  readProductReferenceFromHash,
  toProductHash,
} from './utils/productLink';
import { matchesProductSearch } from './utils/productSearch';

function App() {
  const { products, categorySettings, isLoading, loadError, refreshProducts } =
    useCatalogueProducts();
  const [isAdminPage, setIsAdminPage] = useState(window.location.hash === '#admin');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [returnToCartOnProductClose, setReturnToCartOnProductClose] = useState(false);
  const cart = useCart(!isAdminPage);
  const tickerMessages = useTickerMessages(!isAdminPage);

  // Registered once for the whole app so both the shop and admin console
  // (see AdminPage.tsx) are installable as home-screen apps.
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  useEffect(() => {
    if (needRefresh) void updateServiceWorker(true);
  }, [needRefresh, updateServiceWorker]);

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

  const [activeCategory, setActiveCategory] = useState<CatalogueFilter>('All');
  const [query, setQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [catalogueTime, setCatalogueTime] = useState(Date.now);
  const [categoryScrollRequest, setCategoryScrollRequest] = useState(0);
  const [areCatalogueToolsSticky, setAreCatalogueToolsSticky] = useState(false);
  const [catalogueToolsHeight, setCatalogueToolsHeight] = useState(0);
  const pendingProductReference = useRef(readProductReferenceFromHash());
  const productReturnScrollY = useRef<number | null>(null);
  const catalogueToolsSentinelRef = useRef<HTMLDivElement>(null);
  const catalogueToolsRef = useRef<HTMLDivElement>(null);
  const stickyCatalogueToolsRef = useRef<HTMLDivElement>(null);
  const productGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setCatalogueTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const tools = catalogueToolsRef.current;
    if (!tools) return;
    const observer = new ResizeObserver(() => setCatalogueToolsHeight(tools.offsetHeight));
    setCatalogueToolsHeight(tools.offsetHeight);
    observer.observe(tools);
    return () => observer.disconnect();
  }, [areCatalogueToolsSticky]);

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
    if (!reference || products.length === 0) return;
    const match = findProductByReference(products, reference);
    if (!match) return;
    pendingProductReference.current = null;
    trackProductSelected(match);
    // eslint-disable-next-line react/set-state-in-effect -- syncs the opened product with the incoming URL
    setSelectedProduct(match);
  }, [products]);

  useEffect(() => {
    if (isAdminPage || pendingProductReference.current) return;
    const { pathname, search } = window.location;
    const hash = selectedProduct ? toProductHash(selectedProduct) : '';
    window.history.replaceState(null, '', `${pathname}${search}${hash}`);
  }, [isAdminPage, selectedProduct]);

  // Opens the product when a link lands in an already-loaded tab, where the
  // browser only changes the hash instead of reloading the page.
  useEffect(() => {
    const openProductFromHash = () => {
      const reference = readProductReferenceFromHash();
      if (!reference) return;
      const match = findProductByReference(products, reference);
      if (!match || match.id === selectedProduct?.id) return;
      trackProductSelected(match);
      setSelectedProduct(match);
    };
    window.addEventListener('hashchange', openProductFromHash);
    return () => window.removeEventListener('hashchange', openProductFromHash);
  }, [products, selectedProduct]);

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

  const selectCategory = (category: CatalogueFilter) => {
    trackEvent('select_category', { category });
    setActiveCategory(category);
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
          activeCategory === 'All' ||
          (activeCategory === 'New'
            ? isProductNew(product)
            : product.category === activeCategory);
        const matchesQuery = matchesProductSearch(product, query);
        return matchesCategory && matchesQuery;
      })
      .sort(
        (left, right) =>
          Number(Boolean(right.featured)) - Number(Boolean(left.featured)) ||
          Number(isProductNew(right, catalogueTime)) -
            Number(isProductNew(left, catalogueTime)) ||
          (categoryRanks.get(left.category) ?? Number.MAX_SAFE_INTEGER) -
            (categoryRanks.get(right.category) ?? Number.MAX_SAFE_INTEGER),
      );
  }, [activeCategory, catalogueTime, categorySettings, products, query]);

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
    return <AdminPage onProductPublished={refreshProducts} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        cartItemCount={cart.itemCount}
        cartUpdateCount={cart.cartUpdateCount}
        onOpenCart={() => setIsCartOpen(true)}
        tickerMessages={tickerMessages}
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

      <main className="max-w-6xl w-full mx-auto px-4 py-6 sm:py-8 flex-1 space-y-5 sm:space-y-6">
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
              active={activeCategory}
              onSelect={selectCategory}
            />
          </div>
        )}
        {areCatalogueToolsSticky && (
          <div
            ref={stickyCatalogueToolsRef}
            className="fixed inset-x-0 top-0 z-40 space-y-3 border-b border-mustard/30 bg-cream/95 px-4 py-3 shadow-sm backdrop-blur-md sm:hidden"
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
            <CategoryFilter
              categories={categories}
              active={activeCategory}
              onSelect={selectCategory}
              compactOnMobile
            />
          </div>
        )}
        <h2 className="font-heading text-2xl md:text-3xl font-bold text-cocoa text-center">
          Shop the Collection
        </h2>
        {loadError && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
            {loadError}
          </p>
        )}
        <div ref={productGridRef}>
          {isLoading ? (
            <p className="py-16 text-center text-cocoa/60">Loading the catalogue…</p>
          ) : (
            <ProductGrid
              products={filteredProducts}
              onSelect={selectProduct}
              onAddToCart={async (product, variant) =>
                Boolean(await cart.addItem(product, variant))
              }
              isCartBusy={cart.isBusy}
              getCartQuantity={(productId, variantId) =>
                cart.cart?.items.find(
                  (item) => item.productId === productId && item.variantId === variantId,
                )?.quantity ?? 0
              }
            />
          )}
        </div>
      </main>

      <Footer />
      {!selectedProduct && !isCartOpen && <BackToTopButton />}

      {selectedProduct && (
        <ProductModal
          key={`${selectedProduct.id}:${selectedVariantId ?? ''}`}
          product={selectedProduct}
          initialVariantId={selectedVariantId ?? undefined}
          currentIndex={selectedProductIndex}
          totalProducts={filteredProducts.length}
          onClose={closeSelectedProduct}
          onPrevious={showPreviousProduct}
          onNext={showNextProduct}
          onAddToCart={async (product, variant) => Boolean(await cart.addItem(product, variant))}
          isCartBusy={cart.isBusy}
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
          onOpenProduct={(productId, variantId) => {
            const product = products.find((candidate) => candidate.id === productId);
            if (!product) return;
            trackProductSelected(product);
            productReturnScrollY.current = null;
            setReturnToCartOnProductClose(true);
            setSelectedVariantId(variantId);
            setSelectedProduct(product);
            setIsCartOpen(false);
          }}
        />
      )}
    </div>
  );
}

export default App;
