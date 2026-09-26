import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  deleteProduct,
  fetchManagedProducts,
  updateProduct,
  type ManagedProduct,
  type ProductUpdate,
} from '../../services/products';
import type { Category } from '../../types/product';
import { toProductUrl } from '../../utils/productLink';
import ProductVariantManager from './ProductVariantManager';

interface Props {
  categories: Category[];
  refreshKey: number;
  onChanged: () => Promise<void>;
}

interface EditDraft {
  name: string;
  category: Category;
  description: string;
  published: boolean;
  featured: boolean;
  price: string;
  showPrice: boolean;
}

const createDraft = (product: ManagedProduct): EditDraft => ({
  name: product.name,
  category: product.category,
  description: product.description,
  published: product.published,
  featured: product.featured === true,
  price: product.price === null ? '' : String(product.price),
  showPrice: product.showPrice === true,
});

/** Returns the rupee amount, or `undefined` when the entry is not a valid price. */
const parsePrice = (value: string): number | null | undefined => {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const amount = Number(trimmed);
  return Number.isInteger(amount) && amount >= 0 ? amount : undefined;
};

export default function ProductManager({ categories, refreshKey, onChanged }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      [
        product.name,
        product.category,
        product.description,
        ...product.variants.map((variant) => variant.name),
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }, [products, searchQuery]);

  const copyProductLink = async (product: ManagedProduct) => {
    const url = toProductUrl(product);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(product.id);
      setError(null);
      setMessage(`Link copied for “${product.name}”.`);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setMessage(null);
      setError(`Unable to copy automatically. Link: ${url}`);
    }
  };

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      setProducts(await fetchManagedProducts());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load products.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadProducts());
  }, [loadProducts, refreshKey]);

  const startEditing = (product: ManagedProduct) => {
    setEditingId(product.id);
    setDeleteId(null);
    setDraft(createDraft(product));
    setMessage(null);
    setError(null);
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>, product: ManagedProduct) => {
    event.preventDefault();
    if (!draft) return;

    const price = parsePrice(draft.price);
    if (price === undefined) {
      setError('Enter the price as a whole number of rupees, or leave it blank.');
      return;
    }
    if (draft.showPrice && price === null) {
      setError('Add a price before showing it in the catalogue.');
      return;
    }

    setBusyId(product.id);
    setError(null);
    setMessage(null);
    try {
      const update: ProductUpdate = { ...draft, price };
      const saved = await updateProduct(product, update);
      setProducts((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setEditingId(null);
      setDraft(null);
      setMessage(`${saved.name} was updated.`);
      await onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update the product.');
      await loadProducts();
      await onChanged();
    } finally {
      setBusyId(null);
    }
  };

  const removeProduct = async (product: ManagedProduct) => {
    setBusyId(product.id);
    setError(null);
    setMessage(null);
    try {
      await deleteProduct(product);
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setDeleteId(null);
      setMessage(`${product.name} was removed from the catalogue.`);
      await onChanged();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Unable to remove the product.',
      );
      await loadProducts();
      await onChanged();
    } finally {
      setBusyId(null);
    }
  };

  const handleVariantSaved = async (saved: ManagedProduct, successMessage: string) => {
    setProducts((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    setMessage(successMessage);
    setError(null);
    await onChanged();
  };

  return (
    <section className="mt-4 rounded-2xl border border-mustard/40 bg-white shadow-sm sm:mt-6">
      <div className="flex items-center gap-2 p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          aria-expanded={isExpanded}
          aria-controls="manage-products-panel"
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0">
            <span className="block font-heading text-xl font-bold text-cocoa sm:text-2xl">
              Manage products
            </span>
            <span className="mt-0.5 block text-xs text-cocoa/60 sm:text-sm">
              {isLoading
                ? 'Loading products…'
                : `${products.length} product${products.length === 1 ? '' : 's'} · Search, edit, stock, or remove`}
            </span>
          </span>
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mustard/25 text-xl font-bold text-cocoa transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          >
            ⌄
          </span>
        </button>
        {isExpanded && (
          <button
            type="button"
            onClick={() => void loadProducts()}
            disabled={isLoading || busyId !== null}
            className="shrink-0 rounded-full border-2 border-mustard px-3 py-2 text-xs font-semibold text-cocoa disabled:opacity-60 sm:px-4 sm:text-sm"
          >
            Refresh
          </button>
        )}
      </div>

      {error && (
        <p className="mx-4 mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-5">
          {error}
        </p>
      )}
      {isExpanded && (
        <div id="manage-products-panel" className="border-t border-mustard/30 p-3 sm:p-5">
      {message && (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </p>
      )}

      {products.length > 0 && (
        <div className="mt-5">
          <label className="block text-sm font-semibold text-cocoa" htmlFor="admin-product-search">
            Search products
          </label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              id="admin-product-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by product, category, description, or variant"
              className="min-w-0 flex-1 rounded-xl border border-mustard/60 px-3 py-2"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="self-start rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold text-cocoa"
              >
                Clear search
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-cocoa/55" aria-live="polite">
            Showing {filteredProducts.length} of {products.length} product
            {products.length === 1 ? '' : 's'}
          </p>
        </div>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-cocoa/60">Loading products…</p>
      ) : products.length === 0 ? (
        <p className="py-10 text-center text-cocoa/60">No products have been published yet.</p>
      ) : filteredProducts.length === 0 ? (
        <p className="py-10 text-center text-cocoa/60">
          No products match “{searchQuery.trim()}”.
        </p>
      ) : (
        <div className="mt-4 space-y-3 sm:mt-5 sm:space-y-4">
          {filteredProducts.map((product) => {
            const isEditing = editingId === product.id && draft;
            const isDeleting = deleteId === product.id;
            const isBusy = busyId === product.id;

            return (
              <article
                key={product.id}
                className="min-w-0 rounded-2xl border border-mustard/30 bg-cream/50 p-3 sm:p-4"
              >
                <div className="flex gap-3 sm:gap-4">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="h-20 w-20 shrink-0 rounded-xl bg-cream object-cover sm:h-24 sm:w-24"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-heading text-lg font-bold text-cocoa">{product.name}</h3>
                        <p className="text-sm text-cocoa/60">{product.category}</p>
                        <p className="mt-1 text-xs font-semibold text-cocoa/55">
                          {product.variants.length} variant{product.variants.length === 1 ? '' : 's'}
                        </p>
                        {!product.published && (
                          <span className="mt-1 inline-block rounded-full bg-cocoa/10 px-2 py-0.5 text-xs font-semibold text-cocoa">
                            Hidden
                          </span>
                        )}
                        {product.featured && (
                          <span className="ml-2 mt-1 inline-block rounded-full bg-cocoa px-2 py-0.5 text-xs font-bold text-cream">
                            ★ Featured
                          </span>
                        )}
                        {product.price !== null && (
                          <span className="ml-2 mt-1 inline-block rounded-full bg-mustard/40 px-2 py-0.5 text-xs font-semibold text-cocoa">
                            ₹{product.price}
                            {product.showPrice ? '' : ' (hidden)'}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 min-[430px]:grid-cols-3 sm:flex">
                        <button
                          type="button"
                          onClick={() => void copyProductLink(product)}
                          disabled={isBusy}
                          className="rounded-full border-2 border-cocoa/30 px-3 py-1.5 text-xs font-semibold text-cocoa disabled:opacity-60 sm:px-4 sm:text-sm"
                        >
                          {copiedId === product.id ? 'Copied!' : 'Copy link'}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditing(product)}
                          disabled={isBusy}
                          className="rounded-full border-2 border-mustard px-3 py-1.5 text-xs font-semibold text-cocoa disabled:opacity-60 sm:px-4 sm:text-sm"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteId(product.id);
                            setEditingId(null);
                            setDraft(null);
                          }}
                          disabled={isBusy}
                          className="rounded-full border-2 border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-60 sm:px-4 sm:text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {isDeleting && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-semibold text-red-800">
                      Remove “{product.name}” permanently? This cannot be undone.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void removeProduct(product)}
                        disabled={isBusy}
                        className="rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {isBusy ? 'Removing…' : 'Yes, remove'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(null)}
                        disabled={isBusy}
                        className="rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold text-cocoa"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {isEditing && (
                  <form
                    className="mt-4 grid gap-4 border-t border-mustard/30 pt-4 sm:grid-cols-2"
                    onSubmit={(event) => void saveProduct(event, product)}
                  >
                    <label className="text-sm font-semibold text-cocoa">
                      Product name
                      <input
                        value={draft.name}
                        onChange={(event) =>
                          setDraft((current) =>
                            current ? { ...current, name: event.target.value } : current,
                          )
                        }
                        required
                        minLength={2}
                        maxLength={100}
                        className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-semibold text-cocoa">
                      Category
                      <select
                        value={draft.category}
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? { ...current, category: event.target.value as Category }
                              : current,
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-mustard/60 bg-white px-3 py-2"
                      >
                        {categories.map((category) => (
                          <option key={category}>{category}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-semibold text-cocoa sm:col-span-2">
                      Description
                      <textarea
                        value={draft.description}
                        onChange={(event) =>
                          setDraft((current) =>
                            current ? { ...current, description: event.target.value } : current,
                          )
                        }
                        required
                        minLength={10}
                        maxLength={1000}
                        rows={4}
                        className="mt-1 w-full resize-y rounded-xl border border-mustard/60 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-semibold text-cocoa">
                      Price (₹)
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={draft.price}
                        onChange={(event) =>
                          setDraft((current) =>
                            current ? { ...current, price: event.target.value } : current,
                          )
                        }
                        placeholder="e.g. 349"
                        className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2"
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-5 sm:col-span-2">
                      <label className="flex items-center gap-2 text-sm font-semibold text-cocoa">
                        <input
                          type="checkbox"
                          checked={draft.showPrice}
                          onChange={(event) =>
                            setDraft((current) =>
                              current ? { ...current, showPrice: event.target.checked } : current,
                            )
                          }
                          className="h-4 w-4 accent-cocoa"
                        />
                        Show price in catalogue
                      </label>
                      <label className="flex items-center gap-2 text-sm font-semibold text-cocoa">
                        <input
                          type="checkbox"
                          checked={draft.featured}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? { ...current, featured: event.target.checked }
                                : current,
                            )
                          }
                          className="h-4 w-4 accent-cocoa"
                        />
                        Featured product
                      </label>
                      <label className="flex items-center gap-2 text-sm font-semibold text-cocoa">
                        <input
                          type="checkbox"
                          checked={draft.published}
                          onChange={(event) =>
                            setDraft((current) =>
                              current ? { ...current, published: event.target.checked } : current,
                            )
                          }
                          className="h-4 w-4 accent-cocoa"
                        />
                        Visible in catalogue
                      </label>
                    </div>
                    <div className="flex gap-2 sm:col-span-2">
                      <button
                        type="submit"
                        disabled={isBusy}
                        className="rounded-full bg-cocoa px-5 py-2 text-sm font-semibold text-cream disabled:opacity-60"
                      >
                        {isBusy ? 'Saving…' : 'Save changes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setDraft(null);
                        }}
                        disabled={isBusy}
                        className="rounded-full border border-cocoa/30 px-5 py-2 text-sm font-semibold text-cocoa"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
                {isEditing && (
                  <ProductVariantManager product={product} onSaved={handleVariantSaved} />
                )}
              </article>
            );
          })}
        </div>
      )}
        </div>
      )}
    </section>
  );
}
