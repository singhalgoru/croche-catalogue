import { useEffect, useMemo, useState } from 'react';
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

function App() {
  const { products, categorySettings, isLoading, loadError, refreshProducts } =
    useCatalogueProducts();
  const [isAdminPage, setIsAdminPage] = useState(window.location.hash === '#admin');

  useEffect(() => {
    const updateRoute = () => setIsAdminPage(window.location.hash === '#admin');
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  const categories = useMemo(
    () => categorySettings.map((category) => category.name),
    [categorySettings],
  );

  const [activeCategory, setActiveCategory] = useState<CatalogueFilter>('All');
  const [query, setQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const selectProduct = (product: Product) => {
    trackProductSelected(product);
    setSelectedProduct(product);
  };

  const selectCategory = (category: CatalogueFilter) => {
    trackEvent('select_category', { category });
    setActiveCategory(category);
  };

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
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
        const matchesQuery =
          normalizedQuery === '' || product.name.toLowerCase().includes(normalizedQuery);
        return matchesCategory && matchesQuery;
      })
      .sort(
        (left, right) =>
          Number(Boolean(right.featured)) - Number(Boolean(left.featured)) ||
          (categoryRanks.get(left.category) ?? Number.MAX_SAFE_INTEGER) -
            (categoryRanks.get(right.category) ?? Number.MAX_SAFE_INTEGER),
      );
  }, [activeCategory, categorySettings, products, query]);

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
