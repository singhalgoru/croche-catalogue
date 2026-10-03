import { useEffect, useRef, useState } from 'react';
import { analyzeProductImage, type ProductAnalysis } from '../../services/productAnalysis';
import type { Category } from '../../types/product';
import ProductDetails from '../ProductDetails';
import { PRODUCT_DETAIL_FIELDS } from '../../utils/productDetails';
import { getProductImageUrl } from '../../utils/productImageUrl';

export interface DetailDraft {
  materials: string;
  dimensions: string;
  includedItems: string;
  careInstructions: string;
}

interface AnalysisDraft extends DetailDraft {
  name: string;
  category: Category;
  description: string;
}

interface Props {
  value: AnalysisDraft;
  categories: Category[];
  imageFile?: File | null;
  imageUrl?: string;
  disabled?: boolean;
  onChange: (patch: Partial<AnalysisDraft>) => void;
  onColorSuggested?: (color: string) => void;
  onBusyChange?: (busy: boolean) => void;
}

const SUGGESTION_FIELDS = [
  { key: 'name', label: 'Product name' },
  { key: 'category', label: 'Category' },
  { key: 'description', label: 'Description' },
  ...PRODUCT_DETAIL_FIELDS,
  { key: 'color', label: 'Main variant colour' },
] as const;
type SuggestionKey = typeof SUGGESTION_FIELDS[number]['key'];

export default function ProductDetailsEditor({
  value, categories, imageFile, imageUrl, disabled = false, onChange,
  onColorSuggested, onBusyChange,
}: Props) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [selected, setSelected] = useState<Set<SuggestionKey>>(new Set());
  const [feedback, setFeedback] = useState<string | null>(null);
  const requestId = useRef(0);
  useEffect(() => () => { requestId.current += 1; }, []);

  const suggest = async () => {
    const id = ++requestId.current;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    setAnalysis(null);
    setFeedback(null);
    try {
      let file = imageFile;
      if (!file && imageUrl) {
        const response = await fetch(getProductImageUrl(imageUrl, 960), { mode: 'cors' });
        if (!response.ok) throw new Error(`Unable to load the product photo (${response.status}).`);
        const blob = await response.blob();
        file = new File([blob], 'product.webp', { type: blob.type });
      }
      if (!file) throw new Error('Add a main product photo before requesting suggestions.');
      const suggestion = await analyzeProductImage(file, categories, { ...value, notes });
      if (id !== requestId.current) return;
      setAnalysis(suggestion);
      setSelected(new Set(SUGGESTION_FIELDS
        .filter(({ key }) => key !== 'color' && !value[key]?.trim() && suggestion[key]?.trim())
        .map(({ key }) => key)));
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : 'Unable to suggest product details.');
    } finally {
      if (id === requestId.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  };

  const apply = () => {
    if (!analysis) return;
    const patch: Partial<AnalysisDraft> = {};
    for (const { key } of SUGGESTION_FIELDS) {
      const suggestion = analysis[key]?.trim();
      if (!selected.has(key) || !suggestion) continue;
      if (key === 'color') onColorSuggested?.(suggestion);
      else patch[key] = suggestion;
    }
    onChange(patch);
    setAnalysis(null);
    setFeedback('Selected suggestions applied to the draft. Review before saving; nothing has been published.');
  };

  return (
    <div className="space-y-4 rounded-xl border border-mustard/40 bg-cream/30 p-3 sm:p-4">
      <h3 className="font-heading text-lg font-bold text-cocoa">Specifications &amp; care</h3>
      <p className="text-sm text-cocoa/70">Optional. Only filled fields appear to customers. Enter confirmed facts, not guesses.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {PRODUCT_DETAIL_FIELDS.map(({ key, label }) => (
          <label key={key} className="text-sm font-semibold text-cocoa">
            {label}
            <textarea
              value={value[key]}
              onChange={(event) => onChange({ [key]: event.target.value })}
              rows={key === 'careInstructions' ? 3 : 2}
              maxLength={1000}
              disabled={disabled || busy}
              className="mt-1 w-full resize-y rounded-xl border border-mustard/60 bg-white px-3 py-2"
            />
          </label>
        ))}
      </div>
      <label className="block text-sm font-semibold text-cocoa">
        Confirmed facts for Gemini
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
          rows={3}
          disabled={disabled || busy}
          placeholder="e.g. Cotton yarn, approx. 10 cm diameter, one coaster per order, gentle hand wash."
          className="mt-1 w-full resize-y rounded-xl border border-mustard/60 bg-white px-3 py-2"
        />
      </label>
      <p className="text-xs text-cocoa/70">
        Gemini uses your photo and confirmed facts. Unknown specifications stay blank.
        Price, stock and dispatch promises are not generated. Suggestions must be reviewed.
      </p>
      <button
        type="button"
        onClick={() => void suggest()}
        disabled={disabled || busy || (!imageFile && !imageUrl) || categories.length === 0}
        className="rounded-full bg-mustard px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-60"
      >
        {busy ? 'Gemini is analyzing…' : 'Suggest details from photo & notes'}
      </button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {feedback && <p role="status" className="text-sm text-green-700">{feedback}</p>}
      {analysis && (
        <div className="space-y-3 rounded-xl border border-mustard/40 bg-white p-3">
          <h4 className="font-semibold text-cocoa">Review Gemini suggestions</h4>
          <p className="text-xs text-cocoa/70">
            Select fields to apply. Checked fields replace their current draft values.
            Existing fields are unchecked by default. Verify all facts before saving.
          </p>
          {SUGGESTION_FIELDS.filter(({ key }) => analysis[key]?.trim() && (key !== 'color' || onColorSuggested)).map(({ key, label }) => (
            <label key={key} className="flex items-start gap-2 text-sm text-cocoa">
              <input
                type="checkbox"
                checked={selected.has(key)}
                disabled={disabled}
                onChange={(event) => setSelected((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(key);
                  else next.delete(key);
                  return next;
                })}
                className="mt-1 accent-cocoa"
              />
              <span className="min-w-0">
                <span className="font-semibold">{label}</span>
                <span className="block whitespace-pre-line break-words">{analysis[key]}</span>
                {key !== 'color' && value[key]?.trim() && <span className="block text-xs text-cocoa/60">Current: {value[key]}</span>}
              </span>
            </label>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={apply} disabled={disabled || selected.size === 0} className="rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream disabled:opacity-60">Apply selected suggestions</button>
            <button type="button" onClick={() => setAnalysis(null)} className="rounded-full border border-cocoa/30 px-4 py-2 text-sm text-cocoa">Discard suggestions</button>
          </div>
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-cocoa">Preview customer detail sections</summary>
        <ProductDetails product={value} />
        {!PRODUCT_DETAIL_FIELDS.some(({ key }) => value[key].trim()) && <p className="mt-2 text-sm text-cocoa/60">No specifications or care sections will be shown until you fill them in.</p>}
      </details>
    </div>
  );
}
