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

interface Props {
  categories: Category[];
  onPublished: () => Promise<void>;
}

interface ProductDraft {
  name: string;
  category: Category;
  description: string;
}

const EMPTY_DRAFT: ProductDraft = {
  name: '',
  category: 'Charms & Keychains',
  description: '',
};

export default function ProductUploadForm({ categories, onPublished }: Props) {
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

    setIsPublishing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const product = await publishProduct({
        ...draft,
        category,
        variants: variants.map((variant) => ({
          name: variant.name.trim(),
          color: variant.color,
          inStock: variant.inStock,
          imageFile: variant.imageFile!,
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
    <form className="space-y-6" onSubmit={submitProduct}>
      <section className="rounded-2xl border border-mustard/40 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-heading text-2xl font-bold text-cocoa">Add a new product</h2>
            <p className="mt-1 text-sm text-cocoa/65">
              Add one photo, name, colour, and stock status for each available variant.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void analyzeImage()}
            disabled={!variants[0]?.imageFile || categories.length === 0 || isAnalyzing || isPublishing}
            className="shrink-0 rounded-full bg-mustard px-5 py-2.5 font-semibold text-cocoa disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAnalyzing ? 'Gemini is analyzing…' : 'Generate details with Gemini'}
          </button>
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
        </div>
      </section>

      <section className="rounded-2xl border border-mustard/40 bg-white p-5 shadow-sm">
        <h2 className="font-heading text-xl font-bold text-cocoa">Product variants</h2>
        <p className="mt-1 text-sm text-cocoa/65">
          The main variant is used on the catalogue card. Customers can switch between all
          variants in the product view.
        </p>
        <div className="mt-5">
          <VariantDraftFields
            variants={variants}
            onChange={setVariants}
            disabled={isAnalyzing || isPublishing}
          />
        </div>

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
  );
}
