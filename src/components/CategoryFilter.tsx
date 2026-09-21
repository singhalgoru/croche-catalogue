import type { CatalogueFilter, Category } from '../types/product';

interface Props {
  categories: Category[];
  active: CatalogueFilter;
  onSelect: (category: CatalogueFilter) => void;
}

export default function CategoryFilter({ categories, active, onSelect }: Props) {
  const allOptions: CatalogueFilter[] = ['All', 'New', ...categories];

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {allOptions.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onSelect(option)}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition-colors ${
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
