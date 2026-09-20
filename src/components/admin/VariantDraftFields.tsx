import type { ChangeEvent } from 'react';
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

export default function VariantDraftFields({ variants, onChange, disabled = false }: Props) {
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

  const removeVariant = (variant: VariantDraft) => {
    if (variant.previewUrl) URL.revokeObjectURL(variant.previewUrl);
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
