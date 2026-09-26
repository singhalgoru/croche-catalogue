import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  addVariantStock,
  addProductVariant,
  addVariantGalleryImage,
  deleteProductVariant,
  deleteVariantGalleryImage,
  replaceVariantGalleryImage,
  reorderProductVariants,
  reorderVariantGalleryImages,
  recordVariantSale,
  setVariantMainImage,
  updateProductVariant,
  type ManagedProduct,
  type VariantUpdate,
} from '../../services/products';
import type { ProductVariant, ProductVariantImage } from '../../types/product';
import ImageGenerationPanel from './ImageGenerationPanel';
import ImageFilePicker from './ImageFilePicker';
import { parseOptionalPrice } from './price';
import { suggestVariantColor } from './variantColor';
import { formatINR } from '../../utils/currency';
import { getVariantPrice } from '../../utils/productPrice';

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
  price: string;
  inStock: boolean;
  availableQuantity: number;
  imageFile: File | null;
  previewUrl: string | null;
  galleryFiles: File[];
  galleryPreviewUrls: string[];
}

interface PendingGalleryImage {
  variantId: string;
  file: File;
  previewUrl: string;
}

interface ExistingGalleryEnhancement {
  variantId: string;
  imageId: string;
  sourceFile: File;
  sourceUrl: string;
}

interface ExistingVariantEnhancement {
  variantId: string;
  sourceFile: File;
  sourceUrl: string;
}

interface ExistingImageCreation {
  sourceVariantId: string;
  sourceFile: File;
  sourceUrl: string;
  sourceLabel: string;
  target: 'angle' | 'variant';
}

const emptyDraft = (): Draft => ({
  name: '',
  color: '#f6c453',
  price: '',
  inStock: true,
  availableQuantity: 1,
  imageFile: null,
  previewUrl: null,
  galleryFiles: [],
  galleryPreviewUrls: [],
});

const draftFromVariant = (variant: ProductVariant): Draft => ({
  name: variant.name,
  color: variant.color,
  price: variant.price === null ? '' : String(variant.price),
  inStock: variant.inStock,
  availableQuantity: variant.availableQuantity,
  imageFile: null,
  previewUrl: null,
  galleryFiles: [],
  galleryPreviewUrls: [],
});

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number) => {
  if (toIndex < 0 || toIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
};

export default function ProductVariantManager({ product, onSaved }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [activeDraftGalleryIndex, setActiveDraftGalleryIndex] = useState<number | null>(null);
  const [pendingGalleryImage, setPendingGalleryImage] = useState<PendingGalleryImage | null>(null);
  const [existingVariantEnhancement, setExistingVariantEnhancement] =
    useState<ExistingVariantEnhancement | null>(null);
  const [existingGalleryEnhancement, setExistingGalleryEnhancement] =
    useState<ExistingGalleryEnhancement | null>(null);
  const [existingImageCreation, setExistingImageCreation] =
    useState<ExistingImageCreation | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saleQuantities, setSaleQuantities] = useState<Record<string, number>>({});
  const [stockQuantities, setStockQuantities] = useState<Record<string, number>>({});

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
      setActiveDraftGalleryIndex((activeIndex) => (activeIndex === index ? null : activeIndex));
      return {
        ...current,
        galleryFiles: current.galleryFiles.filter((_, i) => i !== index),
        galleryPreviewUrls: current.galleryPreviewUrls.filter((_, i) => i !== index),
      };
    });
  };

  const replaceDraftGalleryImage = (index: number, file: File) => {
    setDraft((current) => {
      URL.revokeObjectURL(current.galleryPreviewUrls[index]);
      return {
        ...current,
        galleryFiles: current.galleryFiles.map((currentFile, i) => (i === index ? file : currentFile)),
        galleryPreviewUrls: current.galleryPreviewUrls.map((url, i) =>
          i === index ? URL.createObjectURL(file) : url,
        ),
      };
    });
  };

  const moveDraftGalleryImage = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= draft.galleryFiles.length) return;
    setDraft((current) => ({
      ...current,
      galleryFiles: moveItem(current.galleryFiles, index, targetIndex),
      galleryPreviewUrls: moveItem(current.galleryPreviewUrls, index, targetIndex),
    }));
    setActiveDraftGalleryIndex((activeIndex) => {
      if (activeIndex === index) return targetIndex;
      if (activeIndex === targetIndex) return index;
      return activeIndex;
    });
  };

  const selectGalleryImage = (variant: ProductVariant, event: ChangeEvent<HTMLInputElement>) => {
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
    if (pendingGalleryImage) URL.revokeObjectURL(pendingGalleryImage.previewUrl);
    setPendingGalleryImage({
      variantId: variant.id,
      file,
      previewUrl: URL.createObjectURL(file),
    });
    setError(null);
  };

  const discardPendingGalleryImage = () => {
    if (pendingGalleryImage) URL.revokeObjectURL(pendingGalleryImage.previewUrl);
    setPendingGalleryImage(null);
  };

  const replacePendingGalleryImage = (file: File) => {
    setPendingGalleryImage((current) => {
      if (!current) return current;
      URL.revokeObjectURL(current.previewUrl);
      return {
        ...current,
        file,
        previewUrl: URL.createObjectURL(file),
      };
    });
  };

  const uploadPendingGalleryImage = async (variant: ProductVariant) => {
    if (!pendingGalleryImage || pendingGalleryImage.variantId !== variant.id) return;
    setIsBusy(true);
    setError(null);
    try {
      const saved = await addVariantGalleryImage(product, variant, pendingGalleryImage.file);
      discardPendingGalleryImage();
      await onSaved(saved, `Added an angle photo to “${variant.name}”.`);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Unable to add the photo.');
    } finally {
      setIsBusy(false);
    }
  };

  const fileFromExistingImage = async (imageUrl: string, fileName: string) => {
    const response = await fetch(imageUrl, { mode: 'cors' });
    if (!response.ok) {
      throw new Error(`Unable to load the photo for AI editing: ${response.statusText}`);
    }
    const blob = await response.blob();
    const type = blob.type || 'image/jpeg';
    const extension = type.split('/')[1] || 'jpg';
    return new File([blob], `${fileName}.${extension}`, { type });
  };

  const openVariantEnhancement = async (variant: ProductVariant) => {
    setIsBusy(true);
    setError(null);
    try {
      setExistingGalleryEnhancement(null);
      setExistingImageCreation(null);
      setExistingVariantEnhancement({
        variantId: variant.id,
        sourceFile: await fileFromExistingImage(variant.image, `variant-${variant.id}`),
        sourceUrl: variant.image,
      });
    } catch (enhanceError) {
      setError(
        enhanceError instanceof Error
          ? enhanceError.message
          : 'Unable to prepare the variant image for AI editing.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const saveEnhancedVariantImage = async (variant: ProductVariant, file: File) => {
    setIsBusy(true);
    setError(null);
    try {
      const saved = await updateProductVariant(product, variant, {
        name: variant.name,
        color: variant.color,
        price: variant.price,
        inStock: variant.inStock,
        availableQuantity: variant.availableQuantity,
        imageFile: file,
      });
      setExistingVariantEnhancement(null);
      await onSaved(saved, `Updated the main image for “${variant.name}” with AI.`);
    } catch (enhanceError) {
      setError(
        enhanceError instanceof Error
          ? enhanceError.message
          : 'Unable to update the variant image.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const openExistingImageCreation = async (
    variant: ProductVariant,
    sourceUrl: string,
    sourceLabel: string,
  ) => {
    setIsBusy(true);
    setError(null);
    try {
      setExistingVariantEnhancement(null);
      setExistingGalleryEnhancement(null);
      setExistingImageCreation({
        sourceVariantId: variant.id,
        sourceFile: await fileFromExistingImage(
          sourceUrl,
          `ai-source-${variant.id}-${Date.now()}`,
        ),
        sourceUrl,
        sourceLabel,
        target: 'angle',
      });
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Unable to prepare the existing image for AI creation.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const applyCreatedImage = async (variant: ProductVariant, file: File) => {
    if (!existingImageCreation) return;

    if (existingImageCreation.target === 'variant') {
      setDraft((current) => {
        if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
        for (const url of current.galleryPreviewUrls) URL.revokeObjectURL(url);
        return {
          ...emptyDraft(),
          color: variant.color,
          imageFile: file,
          previewUrl: URL.createObjectURL(file),
        };
      });
      setEditingId(null);
      setDeleteId(null);
      setIsAdding(true);
      setExistingImageCreation(null);
      return;
    }

    if (variant.gallery.length >= MAX_GALLERY_IMAGES) {
      setError(`“${variant.name}” already has the maximum number of angle photos.`);
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const saved = await addVariantGalleryImage(product, variant, file);
      setExistingImageCreation(null);
      await onSaved(saved, `Created a new AI angle photo for “${variant.name}”.`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Unable to save the new AI angle photo.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const openGalleryEnhancement = async (
    variant: ProductVariant,
    image: ProductVariantImage,
  ) => {
    setIsBusy(true);
    setError(null);
    try {
      setExistingVariantEnhancement(null);
      setExistingImageCreation(null);
      setExistingGalleryEnhancement({
        variantId: variant.id,
        imageId: image.id,
        sourceFile: await fileFromExistingImage(image.image, `angle-${image.id}`),
        sourceUrl: image.image,
      });
    } catch (enhanceError) {
      setError(
        enhanceError instanceof Error
          ? enhanceError.message
          : 'Unable to prepare the photo for AI editing.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const saveEnhancedGalleryImage = async (
    variant: ProductVariant,
    image: ProductVariantImage,
    file: File,
  ) => {
    setIsBusy(true);
    setError(null);
    try {
      const saved = await replaceVariantGalleryImage(product, image, file);
      setExistingGalleryEnhancement(null);
      await onSaved(saved, `Updated an angle photo for “${variant.name}”.`);
    } catch (enhanceError) {
      setError(enhanceError instanceof Error ? enhanceError.message : 'Unable to update the photo.');
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

  const moveVariant = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= product.variants.length) return;
    setIsBusy(true);
    setError(null);
    try {
      const orderedIds = moveItem(product.variants, index, targetIndex).map((variant) => variant.id);
      const saved = await reorderProductVariants(product, orderedIds);
      await onSaved(saved, `Updated the variant order for ${product.name}.`);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : 'Unable to reorder variants.');
    } finally {
      setIsBusy(false);
    }
  };

  const moveGalleryImage = async (
    variant: ProductVariant,
    index: number,
    direction: -1 | 1,
  ) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= variant.gallery.length) return;
    setIsBusy(true);
    setError(null);
    try {
      const orderedIds = moveItem(variant.gallery, index, targetIndex).map((image) => image.id);
      const saved = await reorderVariantGalleryImages(product, variant, orderedIds);
      await onSaved(saved, `Updated the angle photo order for “${variant.name}”.`);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : 'Unable to reorder angle photos.');
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
    const price = parseOptionalPrice(draft.price);
    if (price === undefined) {
      setError('Enter the variant price as a whole number of rupees, or leave it blank.');
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const saved = await addProductVariant(product, {
        ...draft,
        name: draft.name.trim(),
        price,
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
    const price = parseOptionalPrice(draft.price);
    if (price === undefined) {
      setError('Enter the variant price as a whole number of rupees, or leave it blank.');
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const update: VariantUpdate = { ...draft, price };
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

  const saveSale = async (variant: ProductVariant) => {
    const soldQuantity = saleQuantities[variant.id] ?? 1;
    setIsBusy(true);
    setError(null);
    try {
      const saved = await recordVariantSale(product, variant, soldQuantity);
      setSaleQuantities((current) => ({ ...current, [variant.id]: 1 }));
      await onSaved(
        saved,
        `Recorded ${soldQuantity} sold for “${variant.name}”. ${Math.max(
          variant.availableQuantity - soldQuantity,
          0,
        )} remaining.`,
      );
    } catch (saleError) {
      setError(saleError instanceof Error ? saleError.message : 'Unable to record the sale.');
    } finally {
      setIsBusy(false);
    }
  };

  const saveStock = async (variant: ProductVariant) => {
    const addedQuantity = stockQuantities[variant.id] ?? 1;
    setIsBusy(true);
    setError(null);
    try {
      const saved = await addVariantStock(product, variant, addedQuantity);
      setStockQuantities((current) => ({ ...current, [variant.id]: 1 }));
      await onSaved(
        saved,
        `Added ${addedQuantity} to “${variant.name}”. ${
          variant.availableQuantity + addedQuantity
        } available.`,
      );
    } catch (stockError) {
      setError(stockError instanceof Error ? stockError.message : 'Unable to add stock.');
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
        required={requiresImage && !draft.imageFile}
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
      <label className="min-w-0 text-sm font-semibold text-cocoa">
        Variant price (₹)
        <input
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          value={draft.price}
          onChange={(event) =>
            setDraft((current) => ({ ...current, price: event.target.value }))
          }
          placeholder={`Use product price${product.price === null ? '' : ` (${product.price})`}`}
          className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2"
        />
        <span className="mt-1 block text-xs font-normal text-cocoa/55">
          Leave blank to use the product price.
        </span>
      </label>
      <label className="min-w-0 text-sm font-semibold text-cocoa">
        Stock status
        <select
          value={draft.inStock ? 'in-stock' : 'out-of-stock'}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              inStock: event.target.value === 'in-stock',
              ...(event.target.value === 'in-stock' && current.availableQuantity === 0
                ? { availableQuantity: 1 }
                : {}),
            }))
          }
          className="mt-1 w-full rounded-xl border border-mustard/60 bg-white px-3 py-2"
        >
          <option value="in-stock">In stock</option>
          <option value="out-of-stock">Out of stock</option>
        </select>
      </label>
      <label className="min-w-0 text-sm font-semibold text-cocoa">
        Available quantity
        <input
          type="number"
          min="0"
          step="1"
          value={draft.availableQuantity}
          onChange={(event) => {
            const availableQuantity = Math.max(0, Math.round(event.target.valueAsNumber || 0));
            setDraft((current) => ({
              ...current,
              availableQuantity,
              inStock: availableQuantity > 0 && current.inStock,
            }));
          }}
          className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2"
        />
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
          <>
            <div className="mt-2 flex flex-wrap gap-2">
              {draft.galleryPreviewUrls.map((url, galleryIndex) => {
                const isEditing = activeDraftGalleryIndex === galleryIndex;
                return (
                  <div key={url} className="relative">
                    <img
                      src={url}
                      alt=""
                      className="h-16 w-16 rounded-lg border border-mustard/40 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setActiveDraftGalleryIndex(isEditing ? null : galleryIndex)}
                      disabled={isBusy}
                      aria-pressed={isEditing}
                      aria-label={`Improve additional photo ${galleryIndex + 1} with AI`}
                      className={`absolute -left-1.5 -top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold disabled:opacity-50 ${
                        isEditing ? 'bg-cocoa text-cream' : 'bg-mustard text-cocoa'
                      }`}
                    >
                      AI
                    </button>
                    <button
                      type="button"
                      onClick={() => removeDraftGalleryImage(galleryIndex)}
                      disabled={isBusy}
                      aria-label={`Remove additional photo ${galleryIndex + 1}`}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-cocoa text-xs font-bold text-cream disabled:opacity-50"
                    >
                      ×
                    </button>
                    <div className="absolute bottom-1 right-1 flex gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveDraftGalleryImage(galleryIndex, -1)}
                        disabled={isBusy || galleryIndex === 0}
                        title="Move angle photo left"
                        aria-label={`Move draft additional photo ${galleryIndex + 1} left`}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-[11px] font-bold text-cocoa shadow ring-1 ring-mustard/50 disabled:opacity-35"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDraftGalleryImage(galleryIndex, 1)}
                        disabled={isBusy || galleryIndex === draft.galleryFiles.length - 1}
                        title="Move angle photo right"
                        aria-label={`Move draft additional photo ${galleryIndex + 1} right`}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-[11px] font-bold text-cocoa shadow ring-1 ring-mustard/50 disabled:opacity-35"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {activeDraftGalleryIndex !== null
              && draft.galleryFiles[activeDraftGalleryIndex]
              && draft.galleryPreviewUrls[activeDraftGalleryIndex] && (
                <ImageGenerationPanel
                  sourceFile={draft.galleryFiles[activeDraftGalleryIndex]}
                  sourceUrl={draft.galleryPreviewUrls[activeDraftGalleryIndex]}
                  disabled={isBusy}
                  onUseImage={(file) => replaceDraftGalleryImage(activeDraftGalleryIndex, file)}
                />
            )}
          </>
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
            discardPendingGalleryImage();
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
                    {variant.inStock ? 'In stock' : 'Out of stock'} · {variant.availableQuantity}{' '}
                    available
                  </p>
                  <p className="text-xs text-cocoa/60">
                    {variant.price === null
                      ? `Product price${product.price === null ? ' not set' : `: ${formatINR(product.price)}`}`
                      : `Variant price: ${formatINR(getVariantPrice(product, variant)!)}`}
                  </p>
                </div>
              </div>
              <div className="flex w-full flex-wrap gap-x-4 gap-y-2 sm:w-auto sm:justify-end">
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
                  onClick={() => void openVariantEnhancement(variant)}
                  disabled={isBusy}
                  className="text-sm font-semibold text-cocoa underline disabled:opacity-35"
                  aria-label={`Enhance ${variant.name} main image with AI`}
                >
                  AI enhance
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void openExistingImageCreation(
                      variant,
                      variant.image,
                      `${variant.name} main image`,
                    )
                  }
                  disabled={isBusy}
                  className="text-sm font-semibold text-cocoa underline disabled:opacity-35"
                  aria-label={`Create new image from ${variant.name} main image with AI`}
                >
                  AI create
                </button>
                <button
                  type="button"
                  onClick={() => void moveVariant(index, -1)}
                  disabled={isBusy || index === 0}
                  className="text-sm font-semibold text-cocoa underline disabled:opacity-35"
                >
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => void moveVariant(index, 1)}
                  disabled={isBusy || index === product.variants.length - 1}
                  className="text-sm font-semibold text-cocoa underline disabled:opacity-35"
                >
                  Down
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

            {existingVariantEnhancement?.variantId === variant.id && (
              <div className="mt-3 rounded-xl border border-mustard/30 bg-cream/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-cocoa">
                      Improve uploaded main image
                    </p>
                    <p className="text-xs text-cocoa/55">
                      Generate a result, review it, then replace this variant image only if approved.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExistingVariantEnhancement(null)}
                    disabled={isBusy}
                    className="rounded-full border border-cocoa/30 px-3 py-1 text-xs font-semibold text-cocoa disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
                <ImageGenerationPanel
                  sourceFile={existingVariantEnhancement.sourceFile}
                  sourceUrl={existingVariantEnhancement.sourceUrl}
                  disabled={isBusy}
                  onUseImage={(file) => void saveEnhancedVariantImage(variant, file)}
                />
              </div>
            )}

            {existingImageCreation?.sourceVariantId === variant.id && (
              <div className="mt-3 rounded-xl border border-mustard/30 bg-cream/40 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-cocoa">
                      Create from {existingImageCreation.sourceLabel}
                    </p>
                    <p className="text-xs text-cocoa/55">
                      Choose what the approved AI result should become.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExistingImageCreation(null)}
                    disabled={isBusy}
                    className="self-start rounded-full border border-cocoa/30 px-3 py-1 text-xs font-semibold text-cocoa disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={existingImageCreation.target === 'angle'}
                    onClick={() =>
                      setExistingImageCreation((current) =>
                        current ? { ...current, target: 'angle' } : current,
                      )
                    }
                    disabled={isBusy || variant.gallery.length >= MAX_GALLERY_IMAGES}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-35 ${
                      existingImageCreation.target === 'angle'
                        ? 'border-cocoa bg-cocoa text-white'
                        : 'border-mustard/60 bg-white text-cocoa'
                    }`}
                  >
                    New angle
                  </button>
                  <button
                    type="button"
                    aria-pressed={existingImageCreation.target === 'variant'}
                    onClick={() =>
                      setExistingImageCreation((current) =>
                        current ? { ...current, target: 'variant' } : current,
                      )
                    }
                    disabled={isBusy}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-35 ${
                      existingImageCreation.target === 'variant'
                        ? 'border-cocoa bg-cocoa text-white'
                        : 'border-mustard/60 bg-white text-cocoa'
                    }`}
                  >
                    New variant
                  </button>
                </div>
                <ImageGenerationPanel
                  sourceFile={existingImageCreation.sourceFile}
                  sourceUrl={existingImageCreation.sourceUrl}
                  disabled={isBusy}
                  onUseImage={(file) => void applyCreatedImage(variant, file)}
                />
              </div>
            )}

            <div className="mt-3 border-t border-mustard/20 pt-3">
              <span className="text-xs font-semibold text-cocoa/70">Additional angles</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {variant.gallery.map((image, galleryIndex) => (
                  <div key={image.id}>
                    <div className="relative h-14 w-14">
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
                      <button
                        type="button"
                        onClick={() => void openGalleryEnhancement(variant, image)}
                        disabled={isBusy}
                        title="Improve with AI"
                        aria-label={`Improve additional photo ${galleryIndex + 1} from ${variant.name} with AI`}
                        className="absolute bottom-1 left-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] font-bold text-cocoa shadow ring-1 ring-mustard/50 disabled:opacity-50"
                      >
                        AI
                      </button>
                      <div className="absolute bottom-1 right-1 flex gap-0.5">
                        <button
                          type="button"
                          onClick={() => void moveGalleryImage(variant, galleryIndex, -1)}
                          disabled={isBusy || galleryIndex === 0}
                          title="Move angle photo left"
                          aria-label={`Move additional photo ${galleryIndex + 1} left for ${variant.name}`}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-[11px] font-bold text-cocoa shadow ring-1 ring-mustard/50 disabled:opacity-35"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          onClick={() => void moveGalleryImage(variant, galleryIndex, 1)}
                          disabled={isBusy || galleryIndex === variant.gallery.length - 1}
                          title="Move angle photo right"
                          aria-label={`Move additional photo ${galleryIndex + 1} right for ${variant.name}`}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-[11px] font-bold text-cocoa shadow ring-1 ring-mustard/50 disabled:opacity-35"
                        >
                          ›
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void openExistingImageCreation(
                          variant,
                          image.image,
                          `${variant.name} angle photo ${galleryIndex + 1}`,
                        )
                      }
                      disabled={isBusy}
                      aria-label={`Create new image from additional photo ${galleryIndex + 1} of ${variant.name} with AI`}
                      className="mt-1 block w-14 rounded-full border border-mustard/50 bg-white px-1 py-0.5 text-[10px] font-bold text-cocoa disabled:opacity-35"
                    >
                      + AI
                    </button>
                  </div>
                ))}
                {variant.gallery.length < MAX_GALLERY_IMAGES && (
                  <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-mustard/70 text-lg font-bold text-cocoa hover:border-mustard hover:bg-mustard/10">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => selectGalleryImage(variant, event)}
                      disabled={isBusy}
                      aria-label={`Add an additional photo to ${variant.name}`}
                      className="sr-only"
                    />
                    +
                  </label>
                )}
              </div>
              {existingGalleryEnhancement?.variantId === variant.id && (
                <div className="mt-3 rounded-xl border border-mustard/30 bg-cream/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-cocoa">
                        Improve existing angle photo
                      </p>
                      <p className="text-xs text-cocoa/55">
                        Generate an AI-enhanced version, then use it to replace this angle photo.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExistingGalleryEnhancement(null)}
                      disabled={isBusy}
                      className="rounded-full border border-cocoa/30 px-3 py-1 text-xs font-semibold text-cocoa disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                  <ImageGenerationPanel
                    sourceFile={existingGalleryEnhancement.sourceFile}
                    sourceUrl={existingGalleryEnhancement.sourceUrl}
                    disabled={isBusy}
                    onUseImage={(file) => {
                      const image = variant.gallery.find(
                        (item) => item.id === existingGalleryEnhancement.imageId,
                      );
                      if (image) void saveEnhancedGalleryImage(variant, image, file);
                    }}
                  />
                </div>
              )}
              {pendingGalleryImage?.variantId === variant.id && (
                <div className="mt-3 rounded-xl border border-mustard/30 bg-cream/40 p-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={pendingGalleryImage.previewUrl}
                      alt=""
                      className="h-16 w-16 rounded-lg bg-white object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-cocoa">New angle photo ready</p>
                      <p className="text-xs text-cocoa/55">
                        Improve it with AI before uploading, or upload it as-is.
                      </p>
                    </div>
                  </div>
                  <ImageGenerationPanel
                    sourceFile={pendingGalleryImage.file}
                    sourceUrl={pendingGalleryImage.previewUrl}
                    disabled={isBusy}
                    onUseImage={replacePendingGalleryImage}
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void uploadPendingGalleryImage(variant)}
                      disabled={isBusy}
                      className="rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream disabled:opacity-50"
                    >
                      {isBusy ? 'Uploading…' : 'Upload angle photo'}
                    </button>
                    <button
                      type="button"
                      onClick={discardPendingGalleryImage}
                      disabled={isBusy}
                      className="rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-3 grid gap-3 border-t border-mustard/20 pt-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-xs font-semibold text-cocoa">
                  Add stock quantity
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={stockQuantities[variant.id] ?? 1}
                    onChange={(event) =>
                      setStockQuantities((current) => ({
                        ...current,
                        [variant.id]: Math.max(1, Math.round(event.target.valueAsNumber || 1)),
                      }))
                    }
                    disabled={isBusy}
                    className="mt-1 block w-full rounded-xl border border-mustard/60 px-3 py-2 text-sm"
                    aria-label={`Add stock quantity for ${variant.name}`}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void saveStock(variant)}
                  disabled={isBusy}
                  className="rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream disabled:opacity-50"
                  aria-label={`Add stock for ${variant.name}`}
                >
                  Add stock
                </button>
              </div>
              <div className="flex min-w-0 flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-xs font-semibold text-cocoa">
                  Sold quantity
                  <input
                    type="number"
                    min="1"
                    max={variant.availableQuantity}
                    step="1"
                    value={saleQuantities[variant.id] ?? 1}
                    onChange={(event) =>
                      setSaleQuantities((current) => ({
                        ...current,
                        [variant.id]: Math.max(1, Math.round(event.target.valueAsNumber || 1)),
                      }))
                    }
                    disabled={isBusy || variant.availableQuantity === 0}
                    className="mt-1 block w-full rounded-xl border border-mustard/60 px-3 py-2 text-sm"
                    aria-label={`Sold quantity for ${variant.name}`}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void saveSale(variant)}
                  disabled={
                    isBusy ||
                    variant.availableQuantity === 0 ||
                    (saleQuantities[variant.id] ?? 1) > variant.availableQuantity
                  }
                  className="rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-50"
                  aria-label={`Record sale for ${variant.name}`}
                >
                  Record sale
                </button>
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
                setActiveDraftGalleryIndex(null);
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
