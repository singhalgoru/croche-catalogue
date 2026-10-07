import { useEffect, useRef, useState, type FormEvent } from 'react';
import ProductDetailsEditor from './ProductDetailsEditor';
import AdminDialog from './AdminDialog';
import RequiredMark from './RequiredMark';
import { getProductPublishError } from '../../utils/productPublishValidation';
import PriceDiscoveryPanel from './PriceDiscoveryPanel';
import {
  calculatePriceAtSellingPrice, createDefaultPriceInputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS,
  estimateProductPrice,
} from './priceDiscovery';
import { publishProduct } from '../../services/products';
import type { Category } from '../../types/product';
import VariantDraftFields from './VariantDraftFields';
import {
  createEmptyVariant,
  releaseVariantPreviews,
  type VariantDraft,
} from './variantDraft';
import { parseOptionalPrice } from './price';
import {
  EMPTY_PRODUCT_DRAFT as EMPTY_DRAFT,
  clearProductDraft,
  fromStoredProductDraft,
  isProductDraftEmpty,
  loadProductDraft,
  saveProductDraft,
  type ProductDraft,
} from './productDraftStore';

interface Props {
  categories: Category[];
  onPublished: () => Promise<void>;
}

const DRAFT_SAVE_DELAY_MS = 400;

export default function ProductUploadForm({ categories, onPublished }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [pricingDraftVersion, setPricingDraftVersion] = useState(0);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [variants, setVariants] = useState<VariantDraft[]>(() => [createEmptyVariant('Standard')]);
  const variantsRef = useRef(variants);
  const draftRef = useRef(draft);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [restoredDraftAt, setRestoredDraftAt] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    variantsRef.current = variants;
    draftRef.current = draft;
  }, [draft, variants]);
  useEffect(() => () => releaseVariantPreviews(variantsRef.current), []);

  useEffect(() => {
    let cancelled = false;
    void loadProductDraft().then((stored) => {
      if (cancelled) return;
      // Don't overwrite anything typed while the draft was loading.
      if (stored && isProductDraftEmpty(draftRef.current, variantsRef.current)) {
        const restored = fromStoredProductDraft(stored);
        releaseVariantPreviews(variantsRef.current);
        setDraft(restored.draft);
        setVariants(restored.variants);
        setIsExpanded(true);
        setRestoredDraftAt(stored.savedAt);
      }
      setIsDraftLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isDraftLoaded) return;
    const timer = window.setTimeout(() => {
      if (isProductDraftEmpty(draft, variants)) void clearProductDraft();
      else void saveProductDraft(draft, variants);
    }, DRAFT_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, variants, isDraftLoaded]);

  // The debounce above can be cut short when the admin switches apps, so
  // save straight away as the page is hidden.
  useEffect(() => {
    if (!isDraftLoaded) return;
    const saveNow = () => {
      if (document.visibilityState !== 'hidden') return;
      if (isProductDraftEmpty(draftRef.current, variantsRef.current)) return;
      void saveProductDraft(draftRef.current, variantsRef.current);
    };
    document.addEventListener('visibilitychange', saveNow);
    return () => document.removeEventListener('visibilitychange', saveNow);
  }, [isDraftLoaded]);

  const discardDraft = () => {
    releaseVariantPreviews(variants);
    setDraft(EMPTY_DRAFT);
    setPricingDraftVersion(current => current + 1);
    setVariants([createEmptyVariant('Standard')]);
    setRestoredDraftAt(null);
    setErrorMessage(null);
    void clearProductDraft();
  };

  const submitProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isAnalyzing) return;
    const category = categories.includes(draft.category) ? draft.category : categories[0];
    if (!category) {
      setErrorMessage('Create at least one category before publishing a product.');
      return;
    }
    if (variants.some((variant) => !variant.imageFile || !variant.name.trim())) {
      setErrorMessage('Every variant needs a name and image.');
      return;
    }
    const price = parseOptionalPrice(draft.price);
    if (price === undefined) {
      setErrorMessage('Enter the price as a whole number of rupees, or leave it blank.');
      return;
    }
    const publishError = getProductPublishError({ ...draft, category, price });
    if (publishError) {
      setErrorMessage(publishError);
      return;
    }
    const variantPrices = variants.map((variant) => parseOptionalPrice(variant.price));
    if (variantPrices.some((variantPrice) => variantPrice === undefined)) {
      setErrorMessage(
        'Enter each variant price as a whole number of rupees, or leave it blank.',
      );
      return;
    }
    if (draft.priceDiscoveryInputs && !estimateProductPrice(draft.priceDiscoveryInputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS)) {
      setErrorMessage('Complete the price discovery cost and time fields before publishing.');
      return;
    }
    const pricingOutcome = draft.priceDiscoveryInputs && price !== null
      ? calculatePriceAtSellingPrice(draft.priceDiscoveryInputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS, String(price))
      : null;

    setIsPublishing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const product = await publishProduct({
        ...draft,
        category,
        price,
        profitMarginPercent: pricingOutcome?.profitMarginPercent ?? undefined,
        gstPercent: draft.priceDiscoveryInputs ? Number(draft.priceDiscoveryInputs.gstPercent) : undefined,
        variants: variants.map((variant, index) => ({
          name: variant.name.trim(),
          color: variant.color,
          price: variantPrices[index]!,
          inStock: variant.inStock,
          availableQuantity: variant.availableQuantity,
          imageFile: variant.imageFile!,
          galleryFiles: variant.galleryFiles,
        })),
      });
      await onPublished();
      releaseVariantPreviews(variants);
      setDraft(EMPTY_DRAFT);
      setPricingDraftVersion(current => current + 1);
      setVariants([createEmptyVariant('Standard')]);
      setRestoredDraftAt(null);
      void clearProductDraft();
      setSuccessMessage(`${product.name} with ${product.variants.length} variant${
        product.variants.length === 1 ? '' : 's'
      } was published to the catalogue.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to publish the product.');
    } finally {
      setIsPublishing(false);
    }
  };

  const selectedCategory = categories.includes(draft.category)
    ? draft.category
    : (categories[0] ?? '');

  return (
    <section className="rounded-2xl border border-mustard/40 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        disabled={isAnalyzing || isPublishing}
        aria-expanded={isExpanded}
        aria-controls="add-product-panel"
        className="flex w-full items-center justify-between gap-4 p-4 text-left sm:p-5"
      >
        <span>
          <span className="block font-heading text-xl font-bold text-cocoa sm:text-2xl">
            Add product
          </span>
          <span className="mt-0.5 block text-xs text-cocoa/60 sm:text-sm">
            Upload photos, add details, and publish
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
        <AdminDialog title="Add product" busy={isAnalyzing || isPublishing} onClose={() => setIsExpanded(false)}>
        <form
          id="add-product-panel"
          className="space-y-4 border-t border-mustard/30 p-3 sm:space-y-6 sm:p-5"
          onSubmit={submitProduct}
        >
      <p className="text-sm text-cocoa/70"><RequiredMark /> Required fields. Price is required only when shown in the catalogue. Closing keeps your draft.</p>
      {restoredDraftAt !== null && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-2xl border border-mustard/50 bg-mustard/15 p-3 text-sm text-cocoa sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            Restored your unsaved draft from{' '}
            {new Date(restoredDraftAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            .
          </span>
          <button
            type="button"
            onClick={discardDraft}
            disabled={isAnalyzing || isPublishing}
            className="shrink-0 self-start rounded-full border border-cocoa/30 px-3 py-1 text-xs font-semibold text-cocoa disabled:opacity-60 sm:self-auto"
          >
            Discard draft
          </button>
        </div>
      )}
      <section className="rounded-2xl border border-mustard/40 bg-white p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-mustard-dark">
          Step 1 of 3
        </p>
        <h2 className="mt-1 font-heading text-2xl font-bold text-cocoa">
          Add product photos
        </h2>
        <p className="mt-1 text-sm text-cocoa/65">
          Upload the main product photo first. You can improve it with AI, then add other
          colours or styles as variants.
        </p>
        <div className="mt-5">
          <VariantDraftFields
            variants={variants}
            onChange={setVariants}
            disabled={isAnalyzing || isPublishing}
            productName={draft.name}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-mustard/40 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-mustard-dark">
              Step 2 of 3
            </p>
            <h2 className="mt-1 font-heading text-xl font-bold text-cocoa">
              Review product details
            </h2>
            <p className="mt-1 text-sm text-cocoa/65">
              Enter the details yourself or review Gemini suggestions from the main photo and your confirmed notes.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-cocoa">
            Product name <RequiredMark />
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              required
              minLength={2}
              maxLength={100}
              className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2"
            />
          </label>
          <label className="text-sm font-semibold text-cocoa">
            Category <RequiredMark />
            <select
              value={selectedCategory}
              required
              onChange={(event) =>
                setDraft((current) => ({ ...current, category: event.target.value as Category }))
              }
              className="mt-1 w-full rounded-xl border border-mustard/60 bg-white px-3 py-2"
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-cocoa md:col-span-2">
            Description <RequiredMark />
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              required
              minLength={10}
              maxLength={1000}
              rows={4}
              className="mt-1 w-full resize-y rounded-xl border border-mustard/60 px-3 py-2"
            />
          </label>
          <label className="text-sm font-semibold text-cocoa">
            Price (₹) {draft.showPrice && <RequiredMark />}
            <input
              type="number"
              inputMode="numeric"
              min={draft.showPrice ? 1 : 0}
              step={1}
              required={draft.showPrice}
              value={draft.price}
              onChange={(event) =>
                setDraft((current) => ({ ...current, price: event.target.value }))
              }
              disabled={isAnalyzing || isPublishing}
              placeholder="e.g. 349"
              className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-mustard/30 bg-cream/50 px-3 py-2 text-sm font-semibold text-cocoa">
            <input
              type="checkbox"
              checked={draft.showPrice}
              onChange={(event) =>
                setDraft((current) => ({ ...current, showPrice: event.target.checked }))
              }
              disabled={isAnalyzing || isPublishing}
              className="h-4 w-4 accent-cocoa"
            />
            Show this price in the catalogue
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-mustard/30 bg-cream/50 px-3 py-2 text-sm font-semibold text-cocoa md:col-span-2">
            <input
              type="checkbox"
              checked={draft.featured}
              onChange={(event) =>
                setDraft((current) => ({ ...current, featured: event.target.checked }))
              }
              disabled={isAnalyzing || isPublishing}
              className="h-4 w-4 accent-cocoa"
            />
            Feature this product at the top of the catalogue
          </label>
        </div>
        <fieldset disabled={isAnalyzing || isPublishing}>
          <PriceDiscoveryPanel
            key={pricingDraftVersion}
            product={{ ...draft, name: draft.name.trim() || 'New product', category: selectedCategory }}
            isNewProduct
            defaults={DEFAULT_PRICE_DISCOVERY_DEFAULTS}
            inputs={draft.priceDiscoveryInputs ?? createDefaultPriceInputs()}
            onInputsChange={inputs => setDraft(current => ({ ...current, priceDiscoveryInputs: inputs }))}
            onSaveInputs={async inputs => {
              const nextDraft = { ...draft, priceDiscoveryInputs: inputs };
              setDraft(nextDraft);
              await saveProductDraft(nextDraft, variants, true);
            }}
            onApplyPrice={(price, _margin, _gst, minimumOrderQuantity) => setDraft(current => ({
              ...current, price: String(price), showPrice: true,
              minimumOrderQuantity: minimumOrderQuantity ?? current.minimumOrderQuantity ?? 1,
            }))}
          />
          <label className="mt-4 block text-sm font-semibold text-cocoa">
            Minimum order quantity (pieces) <RequiredMark />
            <input type="number" min={1} max={99} step={1} required
              value={draft.minimumOrderQuantity ?? 1}
              onChange={event => setDraft(current => ({ ...current, minimumOrderQuantity: Number(event.target.value) }))}
              className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2" />
          </label>
        </fieldset>
        <div className="mt-5">
          <ProductDetailsEditor
            value={draft}
            categories={categories}
            imageFile={variants[0]?.imageFile}
            disabled={isPublishing}
            requirePublishDetails
            onBusyChange={setIsAnalyzing}
            onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
            onColorSuggested={(color) => setVariants((current) =>
              current.map((variant, index) => index === 0 ? { ...variant, color } : variant),
            )}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-mustard/40 bg-white p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-mustard-dark">
          Step 3 of 3
        </p>
        <h2 className="mt-1 font-heading text-xl font-bold text-cocoa">Publish product</h2>
        <p className="mt-1 text-sm text-cocoa/65">
          Review the photos and details above. Publishing makes the product visible in the
          catalogue immediately.
        </p>

        {errorMessage && (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {successMessage}
          </p>
        )}
        <button
          type="submit"
          disabled={categories.length === 0 || isAnalyzing || isPublishing}
          className="mt-5 w-full rounded-full bg-cocoa py-2.5 font-semibold text-cream disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPublishing ? 'Publishing…' : `Publish product with ${variants.length} variant${
            variants.length === 1 ? '' : 's'
          }`}
        </button>
      </section>
        </form>
        </AdminDialog>
      )}
    </section>
  );
}
