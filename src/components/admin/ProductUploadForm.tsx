import { useEffect, useRef, useState, type FormEvent } from 'react';
import { analyzeProductImage } from '../../services/productAnalysis';
import { publishProduct } from '../../services/products';
import type { Category } from '../../types/product';
import VariantDraftFields from './VariantDraftFields';
import {
  createEmptyVariant,
  releaseVariantPreviews,
  type VariantDraft,
} from './variantDraft';
import { parseOptionalPrice } from './price';

interface Props {
  categories: Category[];
  onPublished: () => Promise<void>;
}

interface ProductDraft {
  name: string;
  category: Category;
  description: string;
  featured: boolean;
  price: string;
  showPrice: boolean;
}

const EMPTY_DRAFT: ProductDraft = {
  name: '',
  category: 'Charms & Keychains',
  description: '',
  featured: false,
  price: '',
  showPrice: false,
};

export default function ProductUploadForm({ categories, onPublished }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [variants, setVariants] = useState<VariantDraft[]>(() => [createEmptyVariant('Default')]);
  const variantsRef = useRef(variants);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    variantsRef.current = variants;
  }, [variants]);
  useEffect(() => () => releaseVariantPreviews(variantsRef.current), []);

  const analyzeImage = async () => {
    const imageFile = variants[0]?.imageFile;
    if (!imageFile) {
      setErrorMessage('Add the main variant image before running AI analysis.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const analysis = await analyzeProductImage(imageFile, categories);
      setDraft((current) => ({
        ...current,
        name: analysis.name,
        category: analysis.category,
        description: analysis.description,
      }));
      setVariants((current) =>
        current.map((variant, index) =>
          index === 0
            ? {
                ...variant,
                name: variant.name === 'Default' ? analysis.name : variant.name,
                color: analysis.color,
              }
            : variant,
        ),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Product analysis failed.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const submitProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    if (draft.showPrice && price === null) {
      setErrorMessage('Add a price before showing it in the catalogue.');
      return;
    }
    const variantPrices = variants.map((variant) => parseOptionalPrice(variant.price));
    if (variantPrices.some((variantPrice) => variantPrice === undefined)) {
      setErrorMessage(
        'Enter each variant price as a whole number of rupees, or leave it blank.',
      );
      return;
    }

    setIsPublishing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const product = await publishProduct({
        ...draft,
        category,
        price,
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
      setVariants([createEmptyVariant('Default')]);
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
        <form
          id="add-product-panel"
          className="space-y-4 border-t border-mustard/30 p-3 sm:space-y-6 sm:p-5"
          onSubmit={submitProduct}
        >
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
              Enter the details yourself or let Gemini suggest them from the main photo.
            </p>
          </div>
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => void analyzeImage()}
              disabled={
                !variants[0]?.imageFile ||
                categories.length === 0 ||
                isAnalyzing ||
                isPublishing
              }
              className="w-full rounded-full bg-mustard px-5 py-2.5 font-semibold text-cocoa disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAnalyzing ? 'Gemini is analyzing…' : 'Suggest details from photo'}
            </button>
            {!variants[0]?.imageFile && (
              <p className="mt-1 text-center text-xs text-cocoa/50">
                Available after you add the main photo
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-cocoa">
            Product name
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              required
              maxLength={100}
              className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2"
            />
          </label>
          <label className="text-sm font-semibold text-cocoa">
            Category
            <select
              value={selectedCategory}
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
            Description
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
            Price (₹)
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
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
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
      )}
    </section>
  );
}
