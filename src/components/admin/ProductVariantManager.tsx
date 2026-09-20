import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  addProductVariant,
  deleteProductVariant,
  updateProductVariant,
  type ManagedProduct,
  type VariantUpdate,
} from '../../services/products';
import type { ProductVariant } from '../../types/product';

interface Props {
  product: ManagedProduct;
  onSaved: (product: ManagedProduct, message: string) => Promise<void>;
}

interface Draft {
  name: string;
  color: string;
  inStock: boolean;
  imageFile: File | null;
}

const emptyDraft = (): Draft => ({
  name: '',
  color: '#f6c453',
  inStock: true,
  imageFile: null,
});

const draftFromVariant = (variant: ProductVariant): Draft => ({
  name: variant.name,
  color: variant.color,
  inStock: variant.inStock,
  imageFile: null,
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
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      event.target.setCustomValidity('Please choose a JPG, PNG, or WebP image.');
      event.target.reportValidity();
      event.target.value = '';
      return;
    }
    if (file && file.size > 6 * 1024 * 1024) {
      event.target.setCustomValidity('Please choose an image smaller than 6 MB.');
      event.target.reportValidity();
      event.target.value = '';
      return;
    }
    event.target.setCustomValidity('');
    setDraft((current) => ({ ...current, imageFile: file }));
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
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold text-cocoa">
        Variant name
        <input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          required
          maxLength={60}
          className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2"
        />
      </label>
      <label className="text-sm font-semibold text-cocoa">
        {requiresImage ? 'Variant image' : 'Replace image (optional)'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={selectImage}
          required={requiresImage}
          className="mt-1 block w-full text-sm"
        />
      </label>
      <label className="text-sm font-semibold text-cocoa">
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
            className="rounded-xl border border-mustard/30 bg-white p-3"
          >
            <div className="flex items-center gap-3">
              <img
                src={variant.image}
                alt=""
                className="h-16 w-16 rounded-lg bg-cream object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="h-4 w-4 rounded-full border border-cocoa/20"
                    style={{ backgroundColor: variant.color }}
                  />
                  <p className="truncate font-semibold text-cocoa">{variant.name}</p>
                  {index === 0 && (
                    <span className="rounded-full bg-mustard/30 px-2 py-0.5 text-xs font-semibold">
                      Main
                    </span>
                  )}
                </div>
                <p className={`text-xs ${variant.inStock ? 'text-green-700' : 'text-cocoa/50'}`}>
                  {variant.inStock ? 'In stock' : 'Sold out'}
                </p>
              </div>
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
        <form className="mt-4 rounded-xl border-2 border-dashed border-mustard p-4" onSubmit={(event) => void saveNewVariant(event)}>
          <h5 className="font-heading font-bold text-cocoa">New variant</h5>
          <div className="mt-3">{fields(true)}</div>
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={isBusy} className="rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream disabled:opacity-50">
              {isBusy ? 'Adding…' : 'Add variant'}
            </button>
            <button type="button" onClick={() => setIsAdding(false)} className="rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold text-cocoa">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
