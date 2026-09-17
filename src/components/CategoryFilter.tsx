import type { Category } from '../types/product';

interface Props {
  categories: Category[];
  active: Category | 'All';
  onSelect: (category: Category | 'All') => void;
}

export default function CategoryFilter({ categories, active, onSelect }: Props) {
  const allOptions: (Category | 'All')[] = ['All', ...categories];

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {allOptions.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onSelect(option)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            active === option
              ? 'bg-rose-600 text-white border-rose-600'
              : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-50'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
