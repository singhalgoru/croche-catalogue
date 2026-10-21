import type { Category } from '../../types/product';
import type { VariantDraft } from './variantDraft';
import type { DetailDraft } from './ProductDetailsEditor';
import { createDefaultPriceInputs, type PriceDiscoveryInputs } from './priceDiscovery';

// Persists the in-progress "Add product" form so it survives the browser
// discarding a backgrounded tab (common on Android) or the admin navigating
// away and back. IndexedDB is used because it can store the photo Files
// directly; localStorage only holds strings.

export interface ProductDraft extends DetailDraft {
  name: string;
  category: Category;
  description: string;
  featured: boolean;
  price: string;
  showPrice: boolean;
  minimumOrderQuantity?: number;
  priceDiscoveryInputs?: PriceDiscoveryInputs;
}

export const EMPTY_PRODUCT_DRAFT: ProductDraft = {
  name: '',
  category: 'Charms & Keychains',
  description: '',
  seoDescription: '',
  featured: false,
  price: '',
  showPrice: false,
  materials: '',
  dimensions: '',
  includedItems: '',
  careInstructions: '',
};

type StoredVariant = Omit<VariantDraft, 'previewUrl' | 'galleryPreviewUrls'>;

export interface StoredProductDraft {
  draft: Partial<ProductDraft>;
  variants: StoredVariant[];
  savedAt: number;
  savedDraftId?: string;
}

export interface SavedProductDraft extends StoredProductDraft {
  id: string;
}

const DB_NAME = 'luvia-admin';
const STORE_NAME = 'drafts';
const DRAFT_KEY = 'new-product';
// Old drafts are more likely to confuse than help.
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const isProductDraftEmpty = (draft: ProductDraft, variants: VariantDraft[]): boolean =>
  draft.name.trim() === '' &&
  draft.category === EMPTY_PRODUCT_DRAFT.category &&
  draft.description.trim() === '' &&
  !draft.seoDescription?.trim() &&
  draft.price.trim() === '' &&
  draft.materials.trim() === '' &&
  draft.dimensions.trim() === '' &&
  draft.includedItems.trim() === '' &&
  draft.careInstructions.trim() === '' &&
  !draft.featured &&
  !draft.showPrice &&
  (draft.minimumOrderQuantity ?? 1) === 1 &&
  (!draft.priceDiscoveryInputs || Object.entries(createDefaultPriceInputs())
    .every(([key, value]) => draft.priceDiscoveryInputs?.[key as keyof PriceDiscoveryInputs] === value)) &&
  variants.every(
    (variant) =>
      variant.imageFile === null &&
      variant.galleryFiles.length === 0 &&
      variant.price.trim() === '' &&
      variant.inStock &&
      variant.availableQuantity === 1 &&
      variant.color === '#f6c453' &&
      (variant.name.trim() === '' || variant.name === 'Standard'),
  ) &&
  variants.length <= 1;

export const toStoredProductDraft = (
  draft: ProductDraft,
  variants: VariantDraft[],
  now = Date.now(),
): StoredProductDraft => ({
  draft,
  variants: variants.map(({ previewUrl: _preview, galleryPreviewUrls: _gallery, ...rest }) => rest),
  savedAt: now,
});

export const fromStoredProductDraft = (
  stored: StoredProductDraft,
  createObjectUrl: (file: File) => string = (file) => URL.createObjectURL(file),
): { draft: ProductDraft; variants: VariantDraft[] } => ({
  draft: { ...EMPTY_PRODUCT_DRAFT, ...stored.draft },
  variants: stored.variants.map((variant) => ({
    ...variant,
    previewUrl: variant.imageFile ? createObjectUrl(variant.imageFile) : null,
    galleryPreviewUrls: variant.galleryFiles.map((file) => createObjectUrl(file)),
  })),
});

export const isStoredDraftUsable = (
  stored: unknown,
  now = Date.now(),
  maxAge = DRAFT_MAX_AGE_MS,
): stored is StoredProductDraft => {
  if (!stored || typeof stored !== 'object') return false;
  const candidate = stored as Partial<StoredProductDraft>;
  return (
    typeof candidate.savedAt === 'number' &&
    Number.isFinite(candidate.savedAt) &&
    now - candidate.savedAt <= maxAge &&
    typeof candidate.draft === 'object' &&
    candidate.draft !== null &&
    Array.isArray(candidate.variants) &&
    candidate.variants.length > 0
  );
};

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? new Error('Draft storage transaction was aborted.'));
      transaction.onerror = () => reject(transaction.error);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
};

export const loadProductDraft = async (): Promise<StoredProductDraft | null> => {
  try {
    const stored = await withStore('readonly', (store) => store.get(DRAFT_KEY));
    return isStoredDraftUsable(stored) ? stored : null;
  } catch {
    return null;
  }
};

export const saveProductDraft = async (
  draft: ProductDraft,
  variants: VariantDraft[],
  requirePersistence = false,
  savedDraftId?: string,
): Promise<void> => {
  try {
    await withStore('readwrite', (store) =>
      store.put({ ...toStoredProductDraft(draft, variants), savedDraftId }, DRAFT_KEY),
    );
  } catch (error) {
    if (requirePersistence) {
      throw new Error(`Unable to save the draft: ${error instanceof Error ? error.message : 'Storage unavailable.'}`);
    }
    // Draft saving is best-effort; the form keeps working without it.
  }
};

export const listSavedProductDrafts = async (): Promise<SavedProductDraft[]> => {
  const stored = await withStore<unknown[]>('readonly', (store) => store.getAll());
  return stored.filter((value): value is SavedProductDraft =>
    typeof value === 'object' && value !== null &&
    'id' in value && typeof value.id === 'string' &&
    // Explicitly saved drafts do not expire like automatic recovery drafts.
    isStoredDraftUsable(value, Date.now(), Infinity),
  ).sort((a, b) => b.savedAt - a.savedAt);
};

export const saveNamedProductDraft = async (
  draft: ProductDraft,
  variants: VariantDraft[],
  id: string = crypto.randomUUID(),
): Promise<SavedProductDraft> => {
  const saved = { ...toStoredProductDraft(draft, variants), id };
  await withStore('readwrite', (store) => store.put(saved, `saved:${id}`));
  return saved;
};

export const deleteSavedProductDraft = async (id: string): Promise<void> => {
  await withStore('readwrite', (store) => store.delete(`saved:${id}`));
};

export const clearProductDraft = async (): Promise<void> => {
  try {
    await withStore('readwrite', (store) => store.delete(DRAFT_KEY));
  } catch {
    // Nothing to clear if storage is unavailable.
  }
};
