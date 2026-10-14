import { useState, type FormEvent } from 'react';
import type { CataloguePriceRange } from '../utils/cataloguePrice';
import { formatINR } from '../utils/currency';

interface Props {
  active: CataloguePriceRange | null;
  onApply: (range: CataloguePriceRange | null) => void;
}

export default function PriceFilter({ active, onApply }: Props) {
  const [minimum, setMinimum] = useState(active?.minimum?.toString() ?? '');
  const [maximum, setMaximum] = useState(active?.maximum?.toString() ?? '');
  const [error, setError] = useState('');

  const label = active
    ? `Filter by price: ${active.minimum === null ? 'Any' : formatINR(active.minimum)}–${active.maximum === null ? 'Any' : formatINR(active.maximum)}`
    : 'Filter by price';

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const min = minimum === '' ? null : Number(minimum);
    const max = maximum === '' ? null : Number(maximum);
    if ((min !== null && (!Number.isSafeInteger(min) || min < 0))
      || (max !== null && (!Number.isSafeInteger(max) || max < 0))) {
      setError('Enter whole rupee amounts of zero or more.');
      return;
    }
    if (min !== null && max !== null && min > max) {
      setError('Minimum price must not exceed maximum price.');
      return;
    }
    setError('');
    onApply(min === null && max === null ? null : { minimum: min, maximum: max });
    event.currentTarget.closest('details')?.removeAttribute('open');
  };

  return (
    <details className="min-w-0">
      <summary className={`min-h-11 cursor-pointer rounded-full border-2 px-4 py-2 text-sm font-semibold ${
        active ? 'border-cocoa bg-cocoa text-cream' : 'border-mustard bg-white text-cocoa'
      }`}>{label}</summary>
      <form onSubmit={apply} className="mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-mustard/40 bg-white p-3 shadow-lg">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Price range (₹)</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-cocoa/75">
              Minimum
              <input type="number" min="0" step="1" inputMode="numeric" value={minimum}
                onChange={event => { setMinimum(event.target.value); setError(''); }}
                placeholder="No minimum" className="mt-1 min-h-11 w-full rounded-lg border border-mustard px-3 text-sm text-cocoa" />
            </label>
            <label className="text-xs font-medium text-cocoa/75">
              Maximum
              <input type="number" min="0" step="1" inputMode="numeric" value={maximum}
                onChange={event => { setMaximum(event.target.value); setError(''); }}
                placeholder="No maximum" className="mt-1 min-h-11 w-full rounded-lg border border-mustard px-3 text-sm text-cocoa" />
            </label>
          </div>
        </fieldset>
        {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          {active && <button type="button" onClick={event => {
            setMinimum(''); setMaximum(''); setError('');
            onApply(null);
            event.currentTarget.closest('details')?.removeAttribute('open');
          }} className="min-h-11 rounded-full px-3 text-sm font-semibold underline">Clear</button>}
          <button type="submit" className="min-h-11 rounded-full bg-cocoa px-4 text-sm font-semibold text-cream">Apply</button>
        </div>
      </form>
    </details>
  );
}
