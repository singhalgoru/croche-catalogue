import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  addProductVariant,
  addVariantGalleryImage,
  deleteProductVariant,
  deleteVariantGalleryImage,
  setVariantMainImage,
  updateProductVariant,
  type ManagedProduct,
  type VariantUpdate,
} from '../../services/products';
import type { ProductVariant, ProductVariantImage } from '../../types/product';
import ImageGenerationPanel from './ImageGenerationPanel';
import ImageFilePicker from './ImageFilePicker';
import { suggestVariantColor } from './variantColor';

const MAX_IMAGE_SIZE = 6 * 1024 * 1024;
const MAX_GALLERY_IMAGES = 6;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface Props {
  product: ManagedProduct;
  onSaved: (product: ManagedProduct, message: string) => Promise<void>;
}

interface Draft {
  name: string;
  color: string;
  inStock: boolean;
  imageFile: File | null;
  previewUrl: string | null;
  galleryFiles: File[];
  galleryPreviewUrls: string[];
}

const emptyDraft = (): Draft => ({
  name: '',
  color: '#f6c453',
  inStock: true,
  imageFile: null,
  previewUrl: null,
  galleryFiles: [],
  galleryPreviewUrls: [],
});

const draftFromVariant = (variant: ProductVariant): Draft => ({
  name: variant.name,
  color: variant.color,
  inStock: variant.inStock,
  imageFile: null,
  previewUrl: null,
  galleryFiles: [],
  galleryPreviewUrls: [],
});

export default function ProductVariantManager({ product, onSaved }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (file && !ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      event.target.setCustomValidity('Please choose a JPG, PNG, or WebP image.');
      event.target.reportValidity();
      event.target.value = '';
      return;
    }
    if (file && file.size > MAX_IMAGE_SIZE) {
      event.target.setCustomValidity('Please choose an image smaller than 6 MB.');
      event.target.reportValidity();
      event.target.value = '';
      return;
    }
    event.target.setCustomValidity('');
    setDraft((current) => {
      if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return {
        ...current,
        imageFile: file,
        previewUrl: file ? URL.createObjectURL(file) : null,
      };
    });
  };

  const addDraftGalleryImages = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length === 0) return;

    setDraft((current) => {
      const remainingSlots = MAX_GALLERY_IMAGES - current.galleryFiles.length;
      const validFiles = files
        .filter((file) => ACCEPTED_IMAGE_TYPES.includes(file.type))
        .filter((file) => file.size <= MAX_IMAGE_SIZE)
        .slice(0, Math.max(remainingSlots, 0));
      if (validFiles.length === 0) return current;
      return {
        ...current,
        galleryFiles: [...current.galleryFiles, ...validFiles],
        galleryPreviewUrls: [
          ...current.galleryPreviewUrls,
          ...validFiles.map((file) => URL.createObjectURL(file)),
        ],
      };
    });
  };

  const removeDraftGalleryImage = (index: number) => {
    setDraft((current) => {
      URL.revokeObjectURL(current.galleryPreviewUrls[index]);
      return {
        ...current,
        galleryFiles: current.galleryFiles.filter((_, i) => i !== index),
        galleryPreviewUrls: current.galleryPreviewUrls.filter((_, i) => i !== index),
      };
    });
  };

  const addGalleryImage = async (variant: ProductVariant, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError('Please choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('Please choose an image smaller than 6 MB.');
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const saved = await addVariantGalleryImage(product, variant, file);
      await onSaved(saved, `Added an angle photo to “${variant.name}”.`);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Unable to add the photo.');
    } finally {
      setIsBusy(false);
    }
  };

  const removeGalleryImage = async (variant: ProductVariant, image: ProductVariantImage) => {
    setIsBusy(true);
    setError(null);
    try {
      const saved = await deleteVariantGalleryImage(product, image);
      await onSaved(saved, `Removed a photo from “${variant.name}”.`);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unable to remove the photo.');
    } finally {
      setIsBusy(false);
    }
  };

  const makeMainImage = async (variant: ProductVariant, image: ProductVariantImage) => {
    setIsBusy(true);
    setError(null);
    try {
      const saved = await setVariantMainImage(product, variant, image);
      await onSaved(saved, `Updated the main photo for “${variant.name}”.`);
    } catch (makeMainError) {
      setError(makeMainError instanceof Error ? makeMainError.message : 'Unable to set the main photo.');
    } finally {
      setIsBusy(false);
    }
  };

  const saveNewVariant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.imageFile) {
      setError('Choose an image for the new variant.');
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const saved = await addProductVariant(product, {
        ...draft,
        name: draft.name.trim(),
        imageFile: draft.imageFile,
        galleryFiles: draft.galleryFiles,
      });
      setIsAdding(false);
      setDraft(emptyDraft());
      await onSaved(saved, `“${draft.name.trim()}” was added to ${product.name}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to add the variant.');
    } finally {
      setIsBusy(false);
    }
  };

  const saveVariant = async (
    event: FormEvent<HTMLFormElement>,
    variant: ProductVariant,
  ) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      const update: VariantUpdate = draft;
      const saved = await updateProductVariant(product, variant, update);
      setEditingId(null);
      setDraft(emptyDraft());
      await onSaved(saved, `“${draft.name.trim()}” was updated.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update the variant.');
    } finally {
      setIsBusy(false);
    }
  };

  const removeVariant = async (variant: ProductVariant) => {
    setIsBusy(true);
    setError(null);
    try {
      const saved = await deleteProductVariant(product, variant);
      setDeleteId(null);
      await onSaved(saved, `“${variant.name}” was removed from ${product.name}.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to remove the variant.');
    } finally {
      setIsBusy(false);
    }
  };

  const fields = (requiresImage: boolean) => (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="min-w-0 text-sm font-semibold text-cocoa">
        Variant name
        <input
          value={draft.name}
          onChange={(event) => {
            const name = event.target.value;
            const suggestedColor = suggestVariantColor(name);
            setDraft((current) => ({
              ...current,
              name,
              ...(suggestedColor ? { color: suggestedColor } : {}),
            }));
          }}
          required
          maxLength={60}
          className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2"
        />
      </label>
      <ImageFilePicker
        label={requiresImage ? 'Variant image' : 'Replace image (optional)'}
        file={draft.imageFile}
        onChange={selectImage}
        required={requiresImage}
        disabled={isBusy}
      />
      <label className="min-w-0 text-sm font-semibold text-cocoa">
        Colour
        <div className="mt-1 flex gap-2">
          <input
            value={draft.color}
            onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))}
            required
            pattern="#[0-9a-fA-F]{6}"
            className="min-w-0 flex-1 rounded-xl border border-mustard/60 px-3 py-2"
          />
          <input
            type="color"
            value={draft.color}
            onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))}
            aria-label="Choose variant colour"
            className="h-10 w-12 rounded-lg border border-mustard/60 bg-white p-1"
          />
        </div>
      </label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-cocoa">
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
      {draft.imageFile && (
        <ImageGenerationPanel
          sourceFile={draft.imageFile}
          sourceUrl={draft.previewUrl!}
          disabled={isBusy}
          onUseImage={(file) =>
            setDraft((current) => {
              if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
              return {
                ...current,
                imageFile: file,
                previewUrl: URL.createObjectURL(file),
              };
            })
          }
        />
      )}
      {requiresImage && (
        <div className="sm:col-span-2">
          <span className="text-sm font-semibold text-cocoa">
            Additional angles (optional)
          </span>
          <p className="mt-0.5 text-xs text-cocoa/55">
            Add top, side, or back views for better visibility — up to {MAX_GALLERY_IMAGES} photos.
          </p>
          {draft.galleryPreviewUrls.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {draft.galleryPreviewUrls.map((url, galleryIndex) => (
                <div key={url} className="relative">
                  <img
                    src={url}
                    alt=""
                    className="h-16 w-16 rounded-lg border border-mustard/40 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeDraftGalleryImage(galleryIndex)}
                    disabled={isBusy}
                    aria-label={`Remove additional photo ${galleryIndex + 1}`}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-cocoa text-xs font-bold text-cream disabled:opacity-50"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {draft.galleryFiles.length < MAX_GALLERY_IMAGES && (
            <label className="mt-2 flex h-10 w-fit cursor-pointer items-center gap-2 rounded-full border-2 border-dashed border-mustard/70 px-3 text-xs font-semibold text-cocoa hover:border-mustard hover:bg-mustard/10">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={addDraftGalleryImages}
                disabled={isBusy}
                aria-label="Add additional angle photos"
                className="sr-only"
              />
              + Add photos
            </label>
          )}
        </div>
      )}
    </div>
  );

  return (
    <section className="mt-5 border-t border-mustard/30 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="font-heading text-lg font-bold text-cocoa">Variants</h4>
          <p className="text-xs text-cocoa/60">
            The first variant is the catalogue card image.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsAdding(true);
            setEditingId(null);
            setDeleteId(null);
            setDraft(emptyDraft());
          }}
          disabled={isBusy || isAdding}
          className="rounded-full bg-mustard px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-50"
        >
          + Add variant
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 grid gap-3">
        {product.variants.map((variant, index) => (
          <div
            key={variant.id}
            role="group"
            aria-label={`${variant.name} variant`}
            className="min-w-0 rounded-xl border border-mustard/30 bg-white p-3"
          >
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={variant.image}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg bg-cream object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-cocoa/20"
                      style={{ backgroundColor: variant.color }}
                    />
                    <p className="truncate font-semibold text-cocoa">{variant.name}</p>
                    {index === 0 && (
                      <span className="shrink-0 rounded-full bg-mustard/30 px-2 py-0.5 text-xs font-semibold">
                        Main
                      </span>
                    )}
                  </div>
                  <p className={`text-xs ${variant.inStock ? 'text-green-700' : 'text-cocoa/50'}`}>
                    {variant.inStock ? 'In stock' : 'Sold out'}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-4 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(variant.id);
                    setDeleteId(null);
                    setIsAdding(false);
                    setDraft(draftFromVariant(variant));
                  }}
                  className="text-sm font-semibold text-cocoa underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteId(variant.id)}
                  disabled={product.variants.length === 1}
                  title={product.variants.length === 1 ? 'Every product needs one variant.' : undefined}
                  className="text-sm font-semibold text-red-700 underline disabled:opacity-35"
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="mt-3 border-t border-mustard/20 pt-3">
              <span className="text-xs font-semibold text-cocoa/70">Additional angles</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {variant.gallery.map((image, galleryIndex) => (
                  <div key={image.id} className="relative">
                    <img
                      src={image.image}
                      alt=""
                      className="h-14 w-14 rounded-lg border border-mustard/40 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => void makeMainImage(variant, image)}
                      disabled={isBusy}
                      title="Set as main image"
                      aria-label={`Set additional photo ${galleryIndex + 1} as the main image for ${variant.name}`}
                      className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-mustard text-xs font-bold text-cocoa disabled:opacity-50"
                    >
                      ★
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeGalleryImage(variant, image)}
                      disabled={isBusy}
                      aria-label={`Remove additional photo ${galleryIndex + 1} from ${variant.name}`}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-cocoa text-xs font-bold text-cream disabled:opacity-50"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {variant.gallery.length < MAX_GALLERY_IMAGES && (
                  <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-mustard/70 text-lg font-bold text-cocoa hover:border-mustard hover:bg-mustard/10">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => void addGalleryImage(variant, event)}
                      disabled={isBusy}
                      aria-label={`Add an additional photo to ${variant.name}`}
                      className="sr-only"
                    />
                    +
                  </label>
                )}
              </div>
            </div>

            {editingId === variant.id && (
              <form className="mt-4 border-t border-mustard/20 pt-4" onSubmit={(event) => void saveVariant(event, variant)}>
                {fields(false)}
                <div className="mt-3 flex gap-2">
                  <button type="submit" disabled={isBusy} className="rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream disabled:opacity-50">
                    {isBusy ? 'Saving…' : 'Save variant'}
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold text-cocoa">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {deleteId === variant.id && (
              <div className="mt-3 rounded-xl bg-red-50 p-3">
                <p className="text-sm font-semibold text-red-800">Remove “{variant.name}” permanently?</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => void removeVariant(variant)} disabled={isBusy} className="rounded-full bg-red-700 px-4 py-1.5 text-sm font-semibold text-white">
                    {isBusy ? 'Removing…' : 'Yes, remove'}
                  </button>
                  <button type="button" onClick={() => setDeleteId(null)} className="rounded-full border border-cocoa/30 px-4 py-1.5 text-sm font-semibold text-cocoa">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {isAdding && (
        <form className="mt-4 min-w-0 rounded-xl border-2 border-dashed border-mustard p-4" onSubmit={(event) => void saveNewVariant(event)}>
          <h5 className="font-heading font-bold text-cocoa">New variant</h5>
          <div className="mt-3">{fields(true)}</div>
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={isBusy} className="rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream disabled:opacity-50">
              {isBusy ? 'Adding…' : 'Add variant'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
                for (const url of draft.galleryPreviewUrls) URL.revokeObjectURL(url);
                setDraft(emptyDraft());
                setIsAdding(false);
              }}
              className="rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold text-cocoa"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
