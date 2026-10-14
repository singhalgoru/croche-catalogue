import { useEffect, useRef } from 'react';
import type { CatalogueFilter, Category } from '../types/product';
import { orderCategoryOptions } from '../utils/categorySelection';

interface Props {
  categories: Category[];
  seasonalCategories?: Category[];
  active: CatalogueFilter;
  onSelect: (category: CatalogueFilter) => void;
  compactOnMobile?: boolean;
  showNew?: boolean;
  collapseCategories?: boolean;
}

export default function CategoryFilter({
  categories,
  seasonalCategories = [],
  active,
  onSelect,
  compactOnMobile = false,
  showNew = true,
  collapseCategories = false,
}: Props) {
  const orderedOptions = orderCategoryOptions(
    ['All', ...(showNew ? (['New'] as const) : []), ...categories],
    active,
  );
  const allOptions = [
    ...categories.filter(category => seasonalCategories.includes(category)),
    ...orderedOptions.filter(option => !seasonalCategories.includes(option)),
  ];
  const rowRef = useRef<HTMLDivElement>(null);

  // On mobile the chips scroll sideways; bring the row back to the start so
  // the chip that just moved to the front is actually visible.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || row.scrollLeft === 0) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    row.scrollTo({ left: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [active]);

  return (
    <div
      ref={rowRef}
      className={`flex items-center gap-2 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0 ${
        collapseCategories
          ? 'min-w-0 flex-nowrap justify-start'
          : compactOnMobile
          ? 'snap-x overflow-x-auto pb-1'
          : 'flex-wrap justify-center overflow-visible'
      }`}
      aria-label="Product categories"
    >
      {(collapseCategories ? allOptions.filter(option => option === 'All' || option === 'New') : allOptions).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onSelect(option)}
          aria-pressed={active === option}
          className={`${seasonalCategories.includes(option) ? 'badge-glow ' : ''}shrink-0 px-2 py-1.5 sm:px-4 rounded-full text-sm font-semibold border-2 transition-colors ${
            compactOnMobile ? 'snap-start' : ''
          } ${
            active === option
              ? 'bg-cocoa text-cream border-cocoa'
              : seasonalCategories.includes(option)
              ? 'bg-mustard text-cocoa border-mustard hover:bg-mustard/80'
              : 'bg-white text-cocoa border-mustard hover:bg-mustard/20'
          }`}
        >
          {option}
        </button>
      ))}
      {collapseCategories && categories.length > 0 && <details className="min-w-0">
        <summary aria-label={active !== 'All' && active !== 'New' ? `Filter by category: ${active}` : 'Filter by category'}
          className={`min-h-11 cursor-pointer whitespace-nowrap rounded-full border-2 px-2 py-2 text-sm font-semibold sm:px-3 ${
          active !== 'All' && active !== 'New' ? 'border-cocoa bg-cocoa text-cream' : 'border-mustard bg-white text-cocoa'
        }`}><span className="sm:hidden">Category</span><span className="hidden sm:inline">Filter by category{active !== 'All' && active !== 'New' ? `: ${active}` : ''}</span></summary>
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Category filters">
          {allOptions.filter(option => option !== 'All' && option !== 'New').map(option => <button
            key={option} type="button" onClick={event => {
              event.currentTarget.closest('details')?.removeAttribute('open');
              onSelect(option);
            }} aria-pressed={active === option}
            className={`${seasonalCategories.includes(option) ? 'badge-glow ' : ''}min-h-11 rounded-full border-2 px-4 py-1.5 text-sm font-semibold ${
              active === option ? 'border-cocoa bg-cocoa text-cream'
                : seasonalCategories.includes(option) ? 'border-mustard bg-mustard text-cocoa'
                  : 'border-mustard bg-white text-cocoa hover:bg-mustard/20'
            }`}>{option}</button>)}
        </div>
      </details>}
    </div>
  );
}
