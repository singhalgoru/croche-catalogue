import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  deleteProduct,
  fetchManagedProducts,
  updateProduct,
  type ManagedProduct,
  type ProductUpdate,
} from '../../services/products';
import { PRODUCT_CATEGORIES, type Category } from '../../types/product';

interface Props {
  refreshKey: number;
  onChanged: () => Promise<void>;
}

interface EditDraft {
  name: string;
  category: Category;
  description: string;
  color: string;
  inStock: boolean;
  published: boolean;
  imageFile: File | null;
}

const MAX_IMAGE_SIZE = 6 * 1024 * 1024;

const createDraft = (product: ManagedProduct): EditDraft => ({
  name: product.name,
  category: product.category,
  description: product.description,
  color: product.color,
  inStock: product.inStock,
  published: product.published,
  imageFile: null,
});

export default function ProductManager({ refreshKey, onChanged }: Props) {
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const selectReplacementImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      event.target.value = '';
      setError('Please choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file && file.size > MAX_IMAGE_SIZE) {
      event.target.value = '';
      setError('Please choose an image smaller than 6 MB.');
      return;
    }
    setDraft((current) => (current ? { ...current, imageFile: file } : current));
    setError(null);
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>, product: ManagedProduct) => {
    event.preventDefault();
    if (!draft) return;

    setBusyId(product.id);
    setError(null);
    setMessage(null);
    try {
      const update: ProductUpdate = draft;
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

  return (
    <section className="mt-10 rounded-2xl border border-mustard/40 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl font-bold text-cocoa">Manage products</h2>
          <p className="mt-1 text-sm text-cocoa/65">
            Edit product details, replace an image, hide an item, or remove it permanently.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadProducts()}
          disabled={isLoading || busyId !== null}
          className="self-start rounded-full border-2 border-mustard px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </p>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-cocoa/60">Loading products…</p>
      ) : products.length === 0 ? (
        <p className="py-10 text-center text-cocoa/60">No products have been published yet.</p>
      ) : (
        <div className="mt-5 space-y-4">
          {products.map((product) => {
            const isEditing = editingId === product.id && draft;
            const isDeleting = deleteId === product.id;
            const isBusy = busyId === product.id;

            return (
              <article
                key={product.id}
                className="rounded-2xl border border-mustard/30 bg-cream/50 p-4"
              >
                <div className="flex gap-4">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="h-24 w-24 shrink-0 rounded-xl bg-cream object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-heading text-lg font-bold text-cocoa">{product.name}</h3>
                        <p className="text-sm text-cocoa/60">{product.category}</p>
                        {!product.published && (
                          <span className="mt-1 inline-block rounded-full bg-cocoa/10 px-2 py-0.5 text-xs font-semibold text-cocoa">
                            Hidden
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEditing(product)}
                          disabled={isBusy}
                          className="rounded-full border-2 border-mustard px-4 py-1.5 text-sm font-semibold text-cocoa disabled:opacity-60"
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
                          className="rounded-full border-2 border-red-300 px-4 py-1.5 text-sm font-semibold text-red-700 disabled:opacity-60"
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
                        {PRODUCT_CATEGORIES.map((category) => (
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
                      Accent colour
                      <div className="mt-1 flex gap-2">
                        <input
                          value={draft.color}
                          onChange={(event) =>
                            setDraft((current) =>
                              current ? { ...current, color: event.target.value } : current,
                            )
                          }
                          required
                          pattern="#[0-9a-fA-F]{6}"
                          className="min-w-0 flex-1 rounded-xl border border-mustard/60 px-3 py-2"
                        />
                        <input
                          type="color"
                          value={draft.color}
                          onChange={(event) =>
                            setDraft((current) =>
                              current ? { ...current, color: event.target.value } : current,
                            )
                          }
                          aria-label={`Choose colour for ${product.name}`}
                          className="h-10 w-12 rounded-lg border border-mustard/60 bg-white p-1"
                        />
                      </div>
                    </label>
                    <label className="text-sm font-semibold text-cocoa">
                      Replace image (optional)
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={selectReplacementImage}
                        className="mt-1 block w-full text-sm"
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-5 sm:col-span-2">
                      <label className="flex items-center gap-2 text-sm font-semibold text-cocoa">
                        <input
                          type="checkbox"
                          checked={draft.inStock}
                          onChange={(event) =>
                            setDraft((current) =>
                              current ? { ...current, inStock: event.target.checked } : current,
                            )
                          }
                          className="h-4 w-4 accent-cocoa"
                        />
                        In stock
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
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
