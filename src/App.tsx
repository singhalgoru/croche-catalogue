import { useEffect, useMemo, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import Header from './components/Header';
import Footer from './components/Footer';
import CategoryFilter from './components/CategoryFilter';
import SearchBar from './components/SearchBar';
import ProductGrid from './components/ProductGrid';
import ProductModal from './components/ProductModal';
import AdminPage from './components/admin/AdminPage';
import { useCatalogueProducts } from './hooks/useCatalogueProducts';
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

  // Registered once for the whole app so both the shop and admin console
  // (see AdminPage.tsx) are installable as home-screen apps.
  useRegisterSW({ immediate: true });

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
  const [catalogueTime, setCatalogueTime] = useState(Date.now);
  const pendingProductReference = useRef(readProductReferenceFromHash());

  useEffect(() => {
    const timer = window.setInterval(() => setCatalogueTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Campaign links such as #product=rose-charm--<id> open the advertised product
  // as soon as the catalogue has loaded.
  useEffect(() => {
    const reference = pendingProductReference.current;
    if (!reference || products.length === 0) return;
    pendingProductReference.current = null;
    const match = findProductByReference(products, reference);
    if (!match) return;
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
    setSelectedProduct(product);
  };

  const selectCategory = (category: CatalogueFilter) => {
    trackEvent('select_category', { category });
    setActiveCategory(category);
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

  const selectedProductIndex = selectedProduct
    ? filteredProducts.findIndex((product) => product.id === selectedProduct.id)
    : -1;

  const showPreviousProduct = () => {
    if (filteredProducts.length <= 1 || selectedProductIndex === -1) return;
    const previousIndex =
      selectedProductIndex === 0 ? filteredProducts.length - 1 : selectedProductIndex - 1;
    setSelectedProduct(filteredProducts[previousIndex]);
  };

  const showNextProduct = () => {
    if (filteredProducts.length <= 1 || selectedProductIndex === -1) return;
    const nextIndex =
      selectedProductIndex === filteredProducts.length - 1 ? 0 : selectedProductIndex + 1;
    setSelectedProduct(filteredProducts[nextIndex]);
  };

  if (isAdminPage) {
    return <AdminPage onProductPublished={refreshProducts} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="max-w-6xl w-full mx-auto px-4 py-6 sm:py-8 flex-1 space-y-5 sm:space-y-6">
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
        <CategoryFilter categories={categories} active={activeCategory} onSelect={selectCategory} />
        <h2 className="font-heading text-2xl md:text-3xl font-bold text-cocoa text-center">
          Shop the Collection
        </h2>
        {loadError && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
            {loadError}
          </p>
        )}
        {isLoading ? (
          <p className="py-16 text-center text-cocoa/60">Loading the catalogue…</p>
        ) : (
          <ProductGrid
            products={filteredProducts}
            onSelect={selectProduct}
          />
        )}
      </main>

      <Footer />

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          currentIndex={selectedProductIndex}
          totalProducts={filteredProducts.length}
          onClose={() => setSelectedProduct(null)}
          onPrevious={showPreviousProduct}
          onNext={showNextProduct}
        />
      )}
    </div>
  );
}

export default App;
