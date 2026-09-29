import { useEffect, useRef } from 'react';
import type { CatalogueFilter, Category } from '../types/product';
import { orderCategoryOptions } from '../utils/categorySelection';

interface Props {
  categories: Category[];
  active: CatalogueFilter;
  onSelect: (category: CatalogueFilter) => void;
  compactOnMobile?: boolean;
  showNew?: boolean;
}

export default function CategoryFilter({
  categories,
  active,
  onSelect,
  compactOnMobile = false,
  showNew = true,
}: Props) {
  const allOptions = orderCategoryOptions(
    ['All', ...(showNew ? (['New'] as const) : []), ...categories],
    active,
  );
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
      className={`flex gap-2 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0 ${
        compactOnMobile
          ? 'snap-x overflow-x-auto pb-1'
          : 'flex-wrap justify-center overflow-visible'
      }`}
      aria-label="Product categories"
    >
      {allOptions.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onSelect(option)}
          aria-pressed={active === option}
          className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition-colors ${
            compactOnMobile ? 'snap-start' : ''
          } ${
            active === option
              ? 'bg-cocoa text-cream border-cocoa'
              : 'bg-white text-cocoa border-mustard hover:bg-mustard/20'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
