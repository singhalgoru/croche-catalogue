import type { CatalogueFilter, Category } from '../types/product';

interface Props {
  categories: Category[];
  active: CatalogueFilter;
  onSelect: (category: CatalogueFilter) => void;
}

export default function CategoryFilter({ categories, active, onSelect }: Props) {
  const allOptions: CatalogueFilter[] = ['All', 'New', ...categories];

  return (
    <div
      className="flex snap-x gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0"
      aria-label="Product categories"
    >
      {allOptions.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onSelect(option)}
          className={`shrink-0 snap-start px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition-colors ${
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
