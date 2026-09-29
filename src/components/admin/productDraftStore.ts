import type { Category } from '../../types/product';
import type { VariantDraft } from './variantDraft';

// Persists the in-progress "Add product" form so it survives the browser
// discarding a backgrounded tab (common on Android) or the admin navigating
// away and back. IndexedDB is used because it can store the photo Files
// directly; localStorage only holds strings.

export interface ProductDraft {
  name: string;
  category: Category;
  description: string;
  featured: boolean;
  price: string;
  showPrice: boolean;
}

export const EMPTY_PRODUCT_DRAFT: ProductDraft = {
  name: '',
  category: 'Charms & Keychains',
  description: '',
  featured: false,
  price: '',
  showPrice: false,
};

type StoredVariant = Omit<VariantDraft, 'previewUrl' | 'galleryPreviewUrls'>;

export interface StoredProductDraft {
  draft: ProductDraft;
  variants: StoredVariant[];
  savedAt: number;
}

const DB_NAME = 'luvia-admin';
const STORE_NAME = 'drafts';
const DRAFT_KEY = 'new-product';
// Old drafts are more likely to confuse than help.
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const isProductDraftEmpty = (draft: ProductDraft, variants: VariantDraft[]): boolean =>
  draft.name.trim() === '' &&
  draft.description.trim() === '' &&
  draft.price.trim() === '' &&
  !draft.featured &&
  !draft.showPrice &&
  variants.every(
    (variant) =>
      variant.imageFile === null &&
      variant.galleryFiles.length === 0 &&
      variant.price.trim() === '' &&
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
): stored is StoredProductDraft => {
  if (!stored || typeof stored !== 'object') return false;
  const candidate = stored as Partial<StoredProductDraft>;
  return (
    typeof candidate.savedAt === 'number' &&
    now - candidate.savedAt <= DRAFT_MAX_AGE_MS &&
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
      const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
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
): Promise<void> => {
  try {
    await withStore('readwrite', (store) =>
      store.put(toStoredProductDraft(draft, variants), DRAFT_KEY),
    );
  } catch {
    // Draft saving is best-effort; the form keeps working without it.
  }
};

export const clearProductDraft = async (): Promise<void> => {
  try {
    await withStore('readwrite', (store) => store.delete(DRAFT_KEY));
  } catch {
    // Nothing to clear if storage is unavailable.
  }
};
