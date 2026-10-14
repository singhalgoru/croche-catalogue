import { useState, type FormEvent } from 'react';
import type { CataloguePriceBand, CataloguePriceRange } from '../utils/cataloguePrice';
import { formatINR } from '../utils/currency';

interface Props {
  active: CataloguePriceRange | null;
  bands: CataloguePriceBand[];
  onApply: (range: CataloguePriceRange | null) => void;
}

export default function PriceFilter({ active, bands, onApply }: Props) {
  const [minimum, setMinimum] = useState(active?.minimum?.toString() ?? '');
  const [maximum, setMaximum] = useState(active?.maximum?.toString() ?? '');
  const [error, setError] = useState('');

  const selectedBand = active && bands.find(
    band => band.minimum === active.minimum && band.maximum === active.maximum,
  );
  const rangeLabel = active
    ? selectedBand?.label ?? (
      active.minimum === null
        ? active.maximum === null ? 'Any price' : `Up to ${formatINR(active.maximum)}`
        : active.maximum === null
          ? `${formatINR(active.minimum)}+`
          : active.minimum === active.maximum
            ? formatINR(active.minimum)
            : `${formatINR(active.minimum)}–${formatINR(active.maximum)}`
    )
    : null;
  const label = active
    ? `Filter by price: ${rangeLabel}`
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
    <div className="inline-flex items-center gap-2">
      <details className="min-w-0">
        <summary aria-label={label} className={`min-h-11 cursor-pointer whitespace-nowrap rounded-full border-2 px-2 py-2 text-sm font-semibold sm:px-3 ${
          active ? 'border-cocoa bg-cocoa text-cream' : 'border-mustard bg-white text-cocoa'
        }`}><span className="sm:hidden">{rangeLabel ?? 'Price'}</span><span className="hidden sm:inline">{label}</span></summary>
        <form onSubmit={apply} className="mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-mustard/40 bg-white p-3 shadow-lg">
          {bands.length > 0 && <fieldset className="mb-3">
            <legend className="mb-2 text-sm font-semibold">Popular price ranges</legend>
            <div className="flex snap-x gap-2 overflow-x-auto pb-1">
              {bands.map(band => {
                const selected = active?.minimum === band.minimum && active.maximum === band.maximum;
                return <button key={band.label} type="button" aria-pressed={selected}
                onClick={event => {
                  setMinimum(String(band.minimum));
                  setMaximum(band.maximum === null ? '' : String(band.maximum));
                  setError('');
                  onApply({ minimum: band.minimum, maximum: band.maximum });
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
                className={`min-h-11 shrink-0 snap-start rounded-full border px-3 text-xs font-semibold ${
                  selected ? 'border-cocoa bg-cocoa text-cream' : 'border-mustard text-cocoa hover:bg-mustard/20'
                }`}>
                {band.label}
              </button>;
              })}
            </div>
          </fieldset>}
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
      {active && <button type="button" onClick={() => {
        setMinimum('');
        setMaximum('');
        setError('');
        onApply(null);
      }} aria-label="Clear price filter" title="Clear price filter"
        className="inline-flex min-h-11 items-center gap-1 rounded-full border border-cocoa/25 bg-white px-3 text-sm font-semibold text-cocoa">
        Clear price <span aria-hidden="true">×</span>
      </button>}
    </div>
  );
}
