import { useState, type ChangeEvent } from 'react';
import ImageGenerationPanel from './ImageGenerationPanel';
import ImageFilePicker from './ImageFilePicker';
import { suggestVariantColor } from './variantColor';
import { createEmptyVariant, type VariantDraft } from './variantDraft';

interface Props {
  variants: VariantDraft[];
  onChange: (variants: VariantDraft[]) => void;
  disabled?: boolean;
}

const MAX_IMAGE_SIZE = 6 * 1024 * 1024;
const MAX_GALLERY_IMAGES = 6;

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number) => {
  if (toIndex < 0 || toIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
};

export default function VariantDraftFields({ variants, onChange, disabled = false }: Props) {
  const [activeGalleryEditor, setActiveGalleryEditor] = useState<{
    variantKey: string;
    index: number;
  } | null>(null);

  const updateVariant = (key: string, changes: Partial<VariantDraft>) => {
    onChange(
      variants.map((variant) => (variant.key === key ? { ...variant, ...changes } : variant)),
    );
  };

  const selectImage = (
    event: ChangeEvent<HTMLInputElement>,
    variant: VariantDraft,
  ) => {
    const file = event.target.files?.[0] ?? null;
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
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
    if (variant.previewUrl) URL.revokeObjectURL(variant.previewUrl);
    updateVariant(variant.key, {
      imageFile: file,
      previewUrl: file ? URL.createObjectURL(file) : null,
    });
  };

  const addGalleryImages = (event: ChangeEvent<HTMLInputElement>, variant: VariantDraft) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length === 0) return;

    const remainingSlots = MAX_GALLERY_IMAGES - variant.galleryFiles.length;
    const validFiles = files
      .filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      .filter((file) => file.size <= MAX_IMAGE_SIZE)
      .slice(0, Math.max(remainingSlots, 0));
    if (validFiles.length === 0) return;

    updateVariant(variant.key, {
      galleryFiles: [...variant.galleryFiles, ...validFiles],
      galleryPreviewUrls: [
        ...variant.galleryPreviewUrls,
        ...validFiles.map((file) => URL.createObjectURL(file)),
      ],
    });
  };

  const removeGalleryImage = (variant: VariantDraft, index: number) => {
    URL.revokeObjectURL(variant.galleryPreviewUrls[index]);
    setActiveGalleryEditor((current) =>
      current?.variantKey === variant.key && current.index === index ? null : current,
    );
    updateVariant(variant.key, {
      galleryFiles: variant.galleryFiles.filter((_, i) => i !== index),
      galleryPreviewUrls: variant.galleryPreviewUrls.filter((_, i) => i !== index),
    });
  };

  const replaceGalleryImage = (variant: VariantDraft, index: number, file: File) => {
    URL.revokeObjectURL(variant.galleryPreviewUrls[index]);
    updateVariant(variant.key, {
      galleryFiles: variant.galleryFiles.map((currentFile, i) => (i === index ? file : currentFile)),
      galleryPreviewUrls: variant.galleryPreviewUrls.map((url, i) =>
        i === index ? URL.createObjectURL(file) : url,
      ),
    });
  };

  const moveVariant = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= variants.length) return;
    onChange(moveItem(variants, index, targetIndex));
  };

  const moveGalleryImage = (variant: VariantDraft, index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= variant.galleryFiles.length) return;
    updateVariant(variant.key, {
      galleryFiles: moveItem(variant.galleryFiles, index, targetIndex),
      galleryPreviewUrls: moveItem(variant.galleryPreviewUrls, index, targetIndex),
    });
    setActiveGalleryEditor((current) => {
      if (current?.variantKey !== variant.key) return current;
      if (current.index === index) return { ...current, index: targetIndex };
      if (current.index === targetIndex) return { ...current, index };
      return current;
    });
  };

  const removeVariant = (variant: VariantDraft) => {
    if (variant.previewUrl) URL.revokeObjectURL(variant.previewUrl);
    for (const url of variant.galleryPreviewUrls) URL.revokeObjectURL(url);
    onChange(variants.filter((item) => item.key !== variant.key));
  };

  return (
    <div className="space-y-4">
      {variants.map((variant, index) => (
        <fieldset
          key={variant.key}
          className="min-w-0 rounded-2xl border border-mustard/40 bg-cream/50 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <legend className="font-heading font-bold text-cocoa">
              {index === 0 ? 'Main variant' : `Variant ${index + 1}`}
            </legend>
            <div className="flex items-center gap-3">
              {variants.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => moveVariant(index, -1)}
                    disabled={disabled || index === 0}
                    className="text-sm font-semibold text-cocoa underline disabled:opacity-35"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => moveVariant(index, 1)}
                    disabled={disabled || index === variants.length - 1}
                    className="text-sm font-semibold text-cocoa underline disabled:opacity-35"
                  >
                    Down
                  </button>
                </>
              )}
              {variants.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeVariant(variant)}
                  disabled={disabled}
                  className="text-sm font-semibold text-red-700 underline disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
            <div className="min-w-0">
              {variant.previewUrl ? (
                <img
                  src={variant.previewUrl}
                  alt=""
                  className="aspect-square w-full rounded-xl bg-white object-cover"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-xl bg-cream-dark px-2 text-center text-xs text-cocoa/50">
                  Add photo
                </div>
              )}
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <label className="min-w-0 text-sm font-semibold text-cocoa">
                Variant name
                <input
                  value={variant.name}
                  onChange={(event) => {
                    const name = event.target.value;
                    const suggestedColor = suggestVariantColor(name);
                    updateVariant(variant.key, {
                      name,
                      ...(suggestedColor ? { color: suggestedColor } : {}),
                    });
                  }}
                  required
                  maxLength={60}
                  placeholder="e.g. Lavender"
                  disabled={disabled}
                  className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2"
                />
              </label>
              <ImageFilePicker
                label="Variant image"
                file={variant.imageFile}
                onChange={(event) => selectImage(event, variant)}
                required={!variant.imageFile}
                disabled={disabled}
              />
              <label className="min-w-0 text-sm font-semibold text-cocoa">
                Colour
                <div className="mt-1 flex gap-2">
                  <input
                    value={variant.color}
                    onChange={(event) => updateVariant(variant.key, { color: event.target.value })}
                    required
                    pattern="#[0-9a-fA-F]{6}"
                    disabled={disabled}
                    className="min-w-0 flex-1 rounded-xl border border-mustard/60 px-3 py-2"
                  />
                  <input
                    type="color"
                    value={variant.color}
                    onChange={(event) => updateVariant(variant.key, { color: event.target.value })}
                    aria-label={`Choose colour for variant ${index + 1}`}
                    disabled={disabled}
                    className="h-10 w-12 rounded-lg border border-mustard/60 bg-white p-1"
                  />
                </div>
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-cocoa">
                <input
                  type="checkbox"
                  checked={variant.inStock}
                  onChange={(event) =>
                    updateVariant(variant.key, { inStock: event.target.checked })
                  }
                  disabled={disabled}
                  className="h-4 w-4 accent-cocoa"
                />
                In stock
              </label>
              {variant.imageFile && (
                <ImageGenerationPanel
                  sourceFile={variant.imageFile}
                  sourceUrl={variant.previewUrl!}
                  disabled={disabled}
                  onUseImage={(file) => {
                    if (variant.previewUrl) URL.revokeObjectURL(variant.previewUrl);
                    updateVariant(variant.key, {
                      imageFile: file,
                      previewUrl: URL.createObjectURL(file),
                    });
                  }}
                />
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-mustard/20 pt-3">
            <span className="text-sm font-semibold text-cocoa">
              Additional angles (optional)
            </span>
            <p className="mt-0.5 text-xs text-cocoa/55">
              Add top, side, or back views for better visibility — up to {MAX_GALLERY_IMAGES} photos.
            </p>
            {variant.galleryPreviewUrls.length > 0 && (
              <>
                <div className="mt-2 flex flex-wrap gap-2">
                  {variant.galleryPreviewUrls.map((url, galleryIndex) => {
                    const isEditing =
                      activeGalleryEditor?.variantKey === variant.key
                      && activeGalleryEditor.index === galleryIndex;
                    return (
                      <div key={url} className="relative">
                        <img
                          src={url}
                          alt=""
                          className="h-16 w-16 rounded-lg border border-mustard/40 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setActiveGalleryEditor(
                            isEditing ? null : { variantKey: variant.key, index: galleryIndex },
                          )}
                          disabled={disabled}
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
                          onClick={() => removeGalleryImage(variant, galleryIndex)}
                          disabled={disabled}
                          aria-label={`Remove additional photo ${galleryIndex + 1}`}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-cocoa text-xs font-bold text-cream disabled:opacity-50"
                        >
                          ×
                        </button>
                        <div className="absolute bottom-1 right-1 flex gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveGalleryImage(variant, galleryIndex, -1)}
                            disabled={disabled || galleryIndex === 0}
                            title="Move angle photo left"
                            aria-label={`Move additional photo ${galleryIndex + 1} left for variant ${index + 1}`}
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-[11px] font-bold text-cocoa shadow ring-1 ring-mustard/50 disabled:opacity-35"
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            onClick={() => moveGalleryImage(variant, galleryIndex, 1)}
                            disabled={disabled || galleryIndex === variant.galleryFiles.length - 1}
                            title="Move angle photo right"
                            aria-label={`Move additional photo ${galleryIndex + 1} right for variant ${index + 1}`}
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-[11px] font-bold text-cocoa shadow ring-1 ring-mustard/50 disabled:opacity-35"
                          >
                            ›
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {activeGalleryEditor?.variantKey === variant.key
                  && variant.galleryFiles[activeGalleryEditor.index]
                  && variant.galleryPreviewUrls[activeGalleryEditor.index] && (
                    <ImageGenerationPanel
                      sourceFile={variant.galleryFiles[activeGalleryEditor.index]}
                      sourceUrl={variant.galleryPreviewUrls[activeGalleryEditor.index]}
                      disabled={disabled}
                      onUseImage={(file) => replaceGalleryImage(
                        variant,
                        activeGalleryEditor.index,
                        file,
                      )}
                    />
                )}
              </>
            )}
            {variant.galleryFiles.length < MAX_GALLERY_IMAGES && (
              <label className="mt-2 flex h-10 w-fit cursor-pointer items-center gap-2 rounded-full border-2 border-dashed border-mustard/70 px-3 text-xs font-semibold text-cocoa hover:border-mustard hover:bg-mustard/10">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => addGalleryImages(event, variant)}
                  disabled={disabled}
                  aria-label="Add additional angle photos"
                  className="sr-only"
                />
                + Add photos
              </label>
            )}
          </div>
        </fieldset>
      ))}

      <button
        type="button"
        onClick={() => onChange([...variants, createEmptyVariant()])}
        disabled={disabled}
        className="w-full rounded-full border-2 border-dashed border-mustard py-2.5 font-semibold text-cocoa hover:bg-mustard/10 disabled:opacity-50"
      >
        + Add another variant
      </button>
    </div>
  );
}
