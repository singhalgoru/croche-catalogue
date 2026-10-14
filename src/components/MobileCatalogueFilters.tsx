import { useState, type FormEvent } from 'react';
import type { CatalogueFilter, Category } from '../types/product';
import type { CataloguePriceBand, CataloguePriceRange } from '../utils/cataloguePrice';

interface Props {
  activeCategory: CatalogueFilter;
  activePriceRange: CataloguePriceRange | null;
  categories: Category[];
  isSticky?: boolean;
  onApplyPriceRange: (range: CataloguePriceRange | null) => void;
  onSelectCategory: (category: CatalogueFilter) => void;
  priceBands: CataloguePriceBand[];
  seasonalCategories?: Category[];
  showNew?: boolean;
}

export default function MobileCatalogueFilters({
  activeCategory,
  activePriceRange,
  categories,
  isSticky = false,
  onApplyPriceRange,
  onSelectCategory,
  priceBands,
  seasonalCategories = [],
  showNew = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [minimum, setMinimum] = useState(activePriceRange?.minimum?.toString() ?? '');
  const [maximum, setMaximum] = useState(activePriceRange?.maximum?.toString() ?? '');
  const [error, setError] = useState('');
  const activeCount = Number(activeCategory !== 'All') + Number(activePriceRange !== null);
  const options: Category[] = ['All', ...(showNew ? ['New'] : []), ...categories];

  const applyCustomRange = (event: FormEvent<HTMLFormElement>) => {
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
    onApplyPriceRange(min === null && max === null ? null : { minimum: min, maximum: max });
  };

  return (
    <div className={`relative min-w-0 sm:hidden ${isSticky ? 'z-50' : ''}`}>
      <button type="button" aria-expanded={open} aria-controls="mobile-catalogue-filters"
        onClick={() => setOpen(value => !value)}
        className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
          activeCount ? 'border-cocoa bg-cocoa text-cream' : 'border-mustard bg-white text-cocoa'
        }`}>
        Filters{activeCount > 0 && <span aria-label={`${activeCount} active`}>({activeCount})</span>}
      </button>
      {open && <section id="mobile-catalogue-filters" aria-label="Catalogue filters"
        className={`${isSticky ? 'absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50' : 'mt-2'} max-h-[min(70dvh,34rem)] overflow-y-auto rounded-2xl border border-mustard/40 bg-white p-4 text-cocoa shadow-xl`}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Filter products</h3>
          {activeCount > 0 && <button type="button" className="min-h-10 px-2 text-sm underline"
            onClick={() => {
              onSelectCategory('All');
              onApplyPriceRange(null);
              setMinimum('');
              setMaximum('');
              setError('');
            }}>Clear all</button>}
        </div>
        <fieldset className="mt-3">
          <legend className="mb-2 text-sm font-semibold">Category</legend>
          <div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto">
            {options.map(category => {
              const selected = category === activeCategory;
              const seasonal = seasonalCategories.includes(category);
              return <button key={category} type="button" aria-pressed={selected}
                onClick={() => onSelectCategory(category)}
                className={`min-h-10 rounded-xl border px-3 py-2 text-left text-sm font-semibold ${
                  selected ? 'border-cocoa bg-cocoa text-cream'
                    : seasonal ? 'border-mustard bg-mustard/40 text-cocoa'
                      : 'border-mustard/40 bg-cream/40 text-cocoa'
                }`}>{category}</button>;
            })}
          </div>
        </fieldset>
        {priceBands.length > 0 && <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-semibold">Price range</legend>
          <div className="grid grid-cols-2 gap-2">
            {priceBands.map(band => {
              const selected = activePriceRange?.minimum === band.minimum
                && activePriceRange.maximum === band.maximum;
              return <button key={band.label} type="button" aria-pressed={selected}
                onClick={() => {
                  onApplyPriceRange({ minimum: band.minimum, maximum: band.maximum });
                  setMinimum(String(band.minimum));
                  setMaximum(band.maximum === null ? '' : String(band.maximum));
                  setError('');
                }}
                className={`min-h-10 rounded-xl border px-3 py-2 text-sm font-semibold ${
                  selected ? 'border-cocoa bg-cocoa text-cream' : 'border-mustard/40 bg-cream/40 text-cocoa'
                }`}>{band.label}</button>;
            })}
          </div>
        </fieldset>}
        <form onSubmit={applyCustomRange} className="mt-4 border-t border-mustard/30 pt-3">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Custom price (₹)</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-cocoa/75">Minimum
                <input type="number" min="0" step="1" inputMode="numeric" value={minimum}
                  onChange={event => { setMinimum(event.target.value); setError(''); }}
                  placeholder="No minimum" className="mt-1 min-h-10 w-full rounded-lg border border-mustard/50 px-3 text-sm text-cocoa" />
              </label>
              <label className="text-xs font-medium text-cocoa/75">Maximum
                <input type="number" min="0" step="1" inputMode="numeric" value={maximum}
                  onChange={event => { setMaximum(event.target.value); setError(''); }}
                  placeholder="No maximum" className="mt-1 min-h-10 w-full rounded-lg border border-mustard/50 px-3 text-sm text-cocoa" />
              </label>
            </div>
          </fieldset>
          {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
          <button type="submit" className="mt-3 min-h-10 rounded-full bg-cocoa px-4 text-sm font-semibold text-cream">
            Apply custom price
          </button>
        </form>
      </section>}
    </div>
  );
}
