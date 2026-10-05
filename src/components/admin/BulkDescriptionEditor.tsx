import { useEffect, useRef, useState } from 'react';
import { analyzeProductImage } from '../../services/productAnalysis';
import { bulkUpdateProductDescriptions, type ManagedProduct, type ProductDescriptionChange } from '../../services/products';
import { getProductImageUrl } from '../../utils/productImageUrl';
import type { Category } from '../../types/product';

interface Props {
  products: ManagedProduct[];
  categories: Category[];
  disabled: boolean;
  disabledReason?: string;
  onBusyChange: (busy: boolean) => void;
  onSaved: () => Promise<void>;
}

interface Review extends ProductDescriptionChange {
  name: string;
  approved: boolean;
}

export default function BulkDescriptionEditor({ products, categories, disabled, disabledReason, onBusyChange, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviews, setReviews] = useState<Review[]>([]);
  const [failures, setFailures] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancelled.current = true; }; }, []);

  const generate = async () => {
    const batch = products.filter(product => selected.has(product.id));
    if (!batch.length || batch.length > 100) {
      setError('Select between 1 and 100 products per batch.');
      return;
    }
    cancelled.current = false;
    setBusy(true);
    setGenerating(true);
    onBusyChange(true);
    setReviews([]);
    setFailures([]);
    setError(null);
    try {
      for (const [index, product] of batch.entries()) {
        if (cancelled.current) break;
        setStatus(`Generating ${index + 1}/${batch.length}: ${product.name}`);
        try {
          const response = await fetch(getProductImageUrl(product.image, 960), { mode: 'cors', cache: 'reload' });
          if (!response.ok) throw new Error(`Photo request failed (${response.status}).`);
          const blob = await response.blob();
          const suggestion = await analyzeProductImage(
            new File([blob], 'product.webp', { type: blob.type }), categories,
            {
              name: product.name, category: product.category, description: product.description,
              seoDescription: product.seoDescription, materials: product.materials,
              dimensions: product.dimensions, includedItems: product.includedItems,
              careInstructions: product.careInstructions,
            }, 'descriptions',
          );
          if (!mounted.current) return;
          setReviews(current => [...current, {
            id: product.id, name: product.name, description: suggestion.description,
            seoDescription: suggestion.seoDescription, originalDescription: product.description,
            originalSeoDescription: product.seoDescription ?? '', approved: true,
          }]);
        } catch (cause) {
          if (!mounted.current) return;
          setFailures(current => [...current, `${product.name}: ${cause instanceof Error ? cause.message : 'Generation failed.'}`]);
        }
      }
      if (mounted.current) setStatus(cancelled.current
        ? 'Generation stopped. Completed suggestions are available for review; nothing was saved.'
        : 'Generation complete. Review and edit each suggestion before saving; nothing was saved.');
    } finally {
      if (mounted.current) { setBusy(false); setGenerating(false); onBusyChange(false); }
    }
  };

  const save = async () => {
    const changes = reviews.filter(review => review.approved).map(({ name: _name, approved: _approved, ...change }) => change);
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      const count = await bulkUpdateProductDescriptions(changes);
      setReviews([]);
      setSelected(new Set());
      setStatus(`${count} products saved. Descriptions and SEO summaries only.`);
      try {
        await onSaved();
      } catch (cause) {
        setError(`Descriptions were saved, but refreshing failed: ${cause instanceof Error ? cause.message : 'Refresh failed.'}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save bulk descriptions.');
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  const updateReview = (id: string, patch: Partial<Review>) =>
    setReviews(current => current.map(review => review.id === id ? { ...review, ...patch } : review));

  return (
    <div className="my-4 rounded-xl border border-mustard/50 bg-cream/40 p-4">
      <button type="button" disabled={busy} aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 text-left font-semibold text-cocoa underline-offset-4 hover:underline focus-visible:underline disabled:cursor-wait">
        <span>Bulk descriptions with Gemini</span>
        <span aria-hidden="true">{open ? '-' : '+'}</span>
      </button>
      {open && <>
        {disabled && <p role="status" className="my-2 text-sm text-cocoa">
          {disabledReason ?? 'Wait for the current product operation to finish before generating or saving bulk descriptions.'}
        </p>}
        <p className="my-2 text-sm text-cocoa/70">
          Select up to 100 products from the current search results. Generate once, review, then save
          all approved descriptions and SEO summaries together. Names, specifications, prices,
          stock and photos stay unchanged. Uses existing confirmed facts; verify AI claims.
          Requests run one at a time and may incur Gemini usage charges.
        </p>
        <fieldset disabled={disabled || busy || reviews.length > 0} className="space-y-2">
          <button type="button" onClick={() => setSelected(new Set(products.map(product => product.id)))}
            className="mr-3 underline">Select all shown</button>
          <button type="button" onClick={() => setSelected(new Set())} className="underline">Clear selection</button>
          <div className="max-h-56 overflow-y-auto">
            {products.map(product => <label key={product.id} className="block text-sm">
              <input type="checkbox" checked={selected.has(product.id)} onChange={event => {
                setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(product.id); else next.delete(product.id); return next; });
              }} /> {product.name}
            </label>)}
          </div>
          <p className="text-xs text-cocoa/70">{products.filter(product => selected.has(product.id)).length} products selected</p>
          <button type="button" disabled={selected.size === 0} onClick={() => void generate()}
            className="rounded-full bg-mustard px-4 py-2 font-semibold text-cocoa disabled:opacity-50">
            Generate selected descriptions
          </button>
        </fieldset>
        {generating && <button type="button" onClick={() => { cancelled.current = true; }}
          className="my-2 underline">Stop after current product</button>}
        {status && <p role="status" className="my-2 text-sm">{status}</p>}
        {error && <p role="alert" className="my-2 text-sm text-red-700">{error}</p>}
        {failures.length > 0 && <div role="alert" className="my-2 text-sm text-red-700">
          Failed products (not included in save):<ul>{failures.map((failure, index) => <li key={index}>{failure}</li>)}</ul>
        </div>}
        {reviews.length > 0 && <fieldset disabled={busy || disabled} className="space-y-4">
          {reviews.map(review => <div key={review.id} className="rounded-xl border border-mustard/40 bg-white p-3">
            <label className="font-semibold"><input type="checkbox" checked={review.approved}
              onChange={event => updateReview(review.id, { approved: event.target.checked })} /> Save {review.name}</label>
            <p className="my-2 whitespace-pre-wrap text-xs text-cocoa/70">Current description: {review.originalDescription}</p>
            <label className="block text-sm">Description for {review.name}
              <textarea rows={4} maxLength={2000} value={review.description}
                onChange={event => updateReview(review.id, { description: event.target.value })}
                className="mt-1 w-full rounded-lg border border-mustard/50 p-2" />
            </label>
            <p className="my-2 text-xs text-cocoa/70">Current SEO: {review.originalSeoDescription || 'Automatic summary'}</p>
            <label className="block text-sm">SEO description for {review.name}
              <textarea rows={2} maxLength={160} value={review.seoDescription}
                onChange={event => updateReview(review.id, { seoDescription: event.target.value })}
                className="mt-1 w-full rounded-lg border border-mustard/50 p-2" />
            </label>
            <p className="text-xs">{review.seoDescription.length}/160</p>
          </div>)}
          <button type="button" disabled={!reviews.some(review => review.approved)}
            onClick={() => void save()} className="rounded-full bg-cocoa px-4 py-2 font-semibold text-cream disabled:opacity-50">
            Save all approved changes
          </button>
          <button type="button" onClick={() => { setReviews([]); setStatus('Suggestions discarded. Nothing was saved.'); }}
            className="ml-3 underline">Discard suggestions</button>
        </fieldset>}
      </>}
    </div>
  );
}
