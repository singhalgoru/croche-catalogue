import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { CatalogueFilter, Category } from '../types/product';
import { getCataloguePriceRangeLabel, type CataloguePriceBand, type CataloguePriceRange } from '../utils/cataloguePrice';

interface Props {
  activeCategory: CatalogueFilter;
  activePriceRange: CataloguePriceRange | null;
  categories: Category[];
  onApplyFilters: (category: CatalogueFilter, range: CataloguePriceRange | null) => void;
  onApplyPriceRange: (range: CataloguePriceRange | null) => void;
  onSelectCategory: (category: CatalogueFilter) => void;
  priceBands: CataloguePriceBand[];
  priceBandsByCategory: ReadonlyMap<CatalogueFilter, CataloguePriceBand[]>;
  seasonalCategories?: Category[];
  showNew?: boolean;
  presentation?: 'default' | 'icon' | 'chips';
}

export default function MobileCatalogueFilters({
  activeCategory,
  activePriceRange,
  categories,
  onApplyFilters,
  onApplyPriceRange,
  onSelectCategory,
  priceBands,
  priceBandsByCategory,
  seasonalCategories = [],
  showNew = true,
  presentation = 'default',
}: Props) {
  const dialogId = useId();
  const [open, setOpen] = useState(false);
  const [draftCategory, setDraftCategory] = useState(activeCategory);
  const [minimum, setMinimum] = useState(activePriceRange?.minimum?.toString() ?? '');
  const [maximum, setMaximum] = useState(activePriceRange?.maximum?.toString() ?? '');
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const activeCount = Number(activeCategory !== 'All') + Number(activePriceRange !== null);
  const options: Category[] = ['All', ...(showNew ? ['New'] : []), ...categories];
  const draftPriceBands = priceBandsByCategory.get(draftCategory) ?? [];
  const draftCount = Number(draftCategory !== 'All') + Number(minimum !== '' || maximum !== '');
  const activePriceLabel = activePriceRange
    ? getCataloguePriceRangeLabel(activePriceRange, priceBands)
    : null;

  const closeFilters = useCallback(() => setOpen(false), []);
  const openFilters = () => {
    setDraftCategory(activeCategory);
    setMinimum(activePriceRange?.minimum?.toString() ?? '');
    setMaximum(activePriceRange?.maximum?.toString() ?? '');
    setError('');
    setOpen(true);
  };
  const clearFilters = () => {
    onSelectCategory('All');
    onApplyPriceRange(null);
    setMinimum('');
    setMaximum('');
    setError('');
    closeFilters();
  };
  const clearDraftFilters = () => {
    setDraftCategory('All');
    setMinimum('');
    setMaximum('');
    setError('');
  };

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeFilters();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open, closeFilters]);

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
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
    onApplyFilters(
      draftCategory,
      min === null && max === null ? null : { minimum: min, maximum: max },
    );
    closeFilters();
  };

  return (
    <div className={`relative min-w-0 sm:hidden ${presentation === 'icon' ? 'shrink-0' : 'w-full'}`}>
      {presentation !== 'chips' && <div className={`flex items-center gap-2 ${presentation === 'icon' ? '' : 'w-full flex-wrap pb-1'}`}>
        {presentation === 'default' && seasonalCategories.filter(category => categories.includes(category)).map(category => (
          <button key={category} type="button" aria-pressed={activeCategory === category}
            onClick={() => onSelectCategory(category)}
            className={`badge-glow min-h-10 shrink-0 truncate rounded-full border px-3 py-2 text-sm font-semibold ${
              activeCategory === category ? 'border-cocoa bg-cocoa text-cream' : 'border-mustard bg-mustard text-cocoa'
            }`}>
            {category}
          </button>
        ))}
        <button type="button" aria-expanded={open} aria-controls={dialogId}
          aria-label={presentation === 'icon' ? `Filters${activeCount ? `, ${activeCount} active` : ''}` : undefined}
          onClick={() => open ? closeFilters() : openFilters()}
          className={`relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full border text-sm font-semibold ${presentation === 'icon' ? 'h-11 w-11' : 'min-h-10 px-4 py-2'} ${
            activeCount ? 'border-cocoa bg-cocoa text-cream' : 'border-mustard bg-white text-cocoa'
          }`}>
          {presentation === 'icon' ? <>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6" /></svg>
            {activeCount > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 rounded-full bg-mustard px-1.5 text-xs text-cocoa">{activeCount}</span>}
          </> : <>Filters{activeCount > 0 && <span aria-label={`${activeCount} active`}>({activeCount})</span>}</>}
        </button>
        {presentation === 'default' && activeCount > 0 && <button type="button" aria-label="Clear all filters" title="Clear all filters"
          onClick={clearFilters}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cocoa/25 bg-white text-xl text-cocoa">
          ×
        </button>}
      </div>}
      {presentation !== 'icon' && activeCount > 0 && <div className="flex flex-wrap items-center gap-2 pb-1">
        {presentation === 'chips' && <button type="button" onClick={clearFilters} aria-label="Clear all filters"
          className="min-h-11 rounded-full border border-cocoa/25 bg-white px-3 text-xs font-semibold text-cocoa">Clear all</button>}
        {activeCategory !== 'All' && <button type="button"
          aria-label={`Clear category filter: ${activeCategory}`}
          onClick={() => onSelectCategory('All')}
          className="inline-flex min-h-10 min-w-0 max-w-full items-center gap-1 rounded-full border border-cocoa/25 bg-white px-3 py-2 text-xs font-semibold text-cocoa">
          <span className="max-w-[70vw] truncate">Category: {activeCategory}</span><span aria-hidden="true">×</span>
        </button>}
        {activePriceRange && activePriceLabel && <button type="button"
          aria-label={`Clear price filter: ${activePriceLabel}`}
          onClick={() => onApplyPriceRange(null)}
          className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-cocoa/25 bg-white px-3 py-2 text-xs font-semibold text-cocoa">
          Price: {activePriceLabel}<span aria-hidden="true">×</span>
        </button>}
      </div>}
      {open && createPortal(
        <div role="presentation"
          onClick={event => {
            if (event.target === event.currentTarget) closeFilters();
          }}
          className="fixed inset-0 z-[130] flex items-end justify-center bg-cocoa/50 backdrop-blur-[2px] sm:items-center sm:p-6">
          <section id={dialogId} ref={dialogRef} role="dialog" aria-modal="true"
            aria-labelledby="mobile-catalogue-filters-title"
            className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white text-cocoa shadow-2xl sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-mustard/30 px-4 py-3">
              <h2 id="mobile-catalogue-filters-title" className="font-heading text-lg font-bold">Filter products</h2>
              <div className="flex items-center gap-2">
                {draftCount > 0 && <button type="button" className="min-h-10 px-2 text-sm underline"
                  onClick={clearDraftFilters}>Clear all</button>}
                <button ref={closeButtonRef} type="button" onClick={closeFilters}
                  aria-label="Close filters"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-cocoa/20 text-2xl">×</button>
              </div>
            </div>
            <div className="min-h-0 overflow-y-auto p-4">
              <fieldset>
                <legend className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">Category ({options.length})</span>
                  {options.length > 4 && <span className="text-xs text-cocoa/65">
                    Scroll to see all {options.length} categories
                  </span>}
                </legend>
                <div className="grid max-h-[min(32dvh,16rem)] grid-cols-2 gap-2 overflow-y-auto overscroll-contain pb-1">
                  {options.map(category => {
                    const selected = category === draftCategory;
                    const seasonal = seasonalCategories.includes(category);
                    return <button key={category} type="button" aria-pressed={selected}
                      onClick={() => {
                        if (category === draftCategory) return;
                        setDraftCategory(category);
                        setMinimum('');
                        setMaximum('');
                        setError('');
                      }}
                      className={`min-h-10 rounded-xl border px-3 py-2 text-left text-sm font-semibold ${
                        selected ? 'border-cocoa bg-cocoa text-cream'
                          : seasonal ? 'border-mustard bg-mustard/40 text-cocoa'
                            : 'border-mustard/40 bg-cream/40 text-cocoa'
                      }`}>{category}</button>;
                  })}
                </div>
              </fieldset>
              {draftPriceBands.length > 0 && <fieldset className="mt-4">
                <legend className="mb-2 text-sm font-semibold">Price range</legend>
                <div className="grid grid-cols-2 gap-2">
                  {draftPriceBands.map(band => {
                    const selected = Number(minimum) === band.minimum
                      && (maximum === '' ? null : Number(maximum)) === band.maximum;
                    return <button key={band.label} type="button" aria-pressed={selected}
                      onClick={() => {
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
              <form id="mobile-catalogue-filter-form" onSubmit={applyFilters} className="mt-4 border-t border-mustard/30 pt-3">
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
              </form>
            </div>
            <div className="flex shrink-0 justify-between gap-3 border-t border-mustard/30 p-3">
              <button type="button" onClick={closeFilters}
                className="min-h-11 rounded-full border border-cocoa/25 px-5 text-sm font-semibold text-cocoa">
                Cancel
              </button>
              <button type="submit" form="mobile-catalogue-filter-form"
                className="min-h-11 rounded-full bg-cocoa px-5 text-sm font-semibold text-cream">
                Show results
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
