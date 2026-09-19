import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { analyzeProductImage } from '../../services/productAnalysis';
import { publishProduct } from '../../services/products';
import { PRODUCT_CATEGORIES, type Category } from '../../types/product';

interface Props {
  onPublished: () => Promise<void>;
}

interface ProductDraft {
  name: string;
  category: Category;
  description: string;
  color: string;
  inStock: boolean;
}

const EMPTY_DRAFT: ProductDraft = {
  name: '',
  category: 'Charms & Keychains',
  description: '',
  color: '#f6c453',
  inStock: true,
};

const MAX_IMAGE_SIZE = 6 * 1024 * 1024;

export default function ProductUploadForm({ onPublished }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      event.target.value = '';
      setImageFile(null);
      setPreviewUrl(null);
      setErrorMessage('Please choose a JPG, PNG, or WebP image.');
      return;
    }

    if (file && file.size > MAX_IMAGE_SIZE) {
      event.target.value = '';
      setImageFile(null);
      setPreviewUrl(null);
      setErrorMessage('Please choose an image smaller than 6 MB.');
      return;
    }

    setImageFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
    setDraft(EMPTY_DRAFT);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const analyzeImage = async () => {
    if (!imageFile) {
      setErrorMessage('Select a product image before running AI analysis.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const analysis = await analyzeProductImage(imageFile);
      setDraft((current) => ({ ...current, ...analysis }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Product analysis failed.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const submitProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!imageFile) {
      setErrorMessage('Select a product image before publishing.');
      return;
    }

    setIsPublishing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const product = await publishProduct({ ...draft, imageFile });
      await onPublished();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setImageFile(null);
      setPreviewUrl(null);
      setDraft(EMPTY_DRAFT);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSuccessMessage(`${product.name} was published to the catalogue.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to publish the product.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <form className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" onSubmit={submitProduct}>
      <section className="rounded-2xl border border-mustard/40 bg-white p-5 shadow-sm">
        <h2 className="font-heading text-xl font-bold text-cocoa">1. Upload product photo</h2>
        <label className="mt-4 block cursor-pointer rounded-2xl border-2 border-dashed border-mustard bg-cream p-4 text-center transition-colors hover:bg-cream-dark">
          <span className="font-semibold text-cocoa">Choose an image</span>
          <span className="mt-1 block text-xs text-cocoa/60">JPG, PNG or WebP; maximum 6 MB</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={selectImage}
            className="sr-only"
          />
        </label>

        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Selected product preview"
            className="mt-4 aspect-square w-full rounded-2xl bg-cream object-contain"
          />
        ) : (
          <div className="mt-4 flex aspect-square items-center justify-center rounded-2xl bg-cream-dark text-sm text-cocoa/50">
            Product preview
          </div>
        )}

        <button
          type="button"
          onClick={analyzeImage}
          disabled={!imageFile || isAnalyzing || isPublishing}
          className="mt-4 w-full rounded-full bg-mustard py-2.5 font-semibold text-cocoa transition-colors hover:bg-mustard-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isAnalyzing ? 'Gemini is analyzing…' : 'Generate details with Gemini'}
        </button>
      </section>

      <section className="rounded-2xl border border-mustard/40 bg-white p-5 shadow-sm">
        <h2 className="font-heading text-xl font-bold text-cocoa">2. Review and publish</h2>
        <p className="mt-1 text-sm text-cocoa/65">
          Check the AI suggestions and edit anything before publishing.
        </p>

        <div className="mt-4 space-y-4">
          <label className="block text-sm font-semibold text-cocoa">
            Product name
            <input
              type="text"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              required
              className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2 outline-none focus:border-cocoa"
            />
          </label>

          <label className="block text-sm font-semibold text-cocoa">
            Category
            <select
              value={draft.category}
              onChange={(event) =>
                setDraft((current) => ({ ...current, category: event.target.value as Category }))
              }
              className="mt-1 w-full rounded-xl border border-mustard/60 bg-white px-3 py-2 outline-none focus:border-cocoa"
            >
              {PRODUCT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-semibold text-cocoa">
            Description
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              required
              rows={5}
              className="mt-1 w-full resize-y rounded-xl border border-mustard/60 px-3 py-2 outline-none focus:border-cocoa"
            />
          </label>

          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <label className="block text-sm font-semibold text-cocoa">
              Accent colour
              <input
                type="text"
                value={draft.color}
                onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))}
                required
                pattern="#[0-9a-fA-F]{6}"
                className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2 outline-none focus:border-cocoa"
              />
            </label>
            <input
              type="color"
              value={draft.color}
              onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))}
              aria-label="Choose accent colour"
              className="h-10 w-12 cursor-pointer rounded-lg border border-mustard/60 bg-white p-1"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-cocoa">
            <input
              type="checkbox"
              checked={draft.inStock}
              onChange={(event) =>
                setDraft((current) => ({ ...current, inStock: event.target.checked }))
              }
              className="h-4 w-4 accent-cocoa"
            />
            In stock
          </label>
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
          disabled={!imageFile || isAnalyzing || isPublishing}
          className="mt-5 w-full rounded-full bg-cocoa py-2.5 font-semibold text-cream transition-colors hover:bg-cocoa-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPublishing ? 'Publishing…' : 'Publish product'}
        </button>
      </section>
    </form>
  );
}
