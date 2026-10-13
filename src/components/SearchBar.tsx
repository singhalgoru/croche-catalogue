interface Props {
  value: string;
  onChange: (value: string) => void;
  onSearch?: (value: string) => void;
  className?: string;
}

export default function SearchBar({ value, onChange, onSearch, className = '' }: Props) {
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => {
        if (value.trim()) onSearch?.(value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && value.trim()) onSearch?.(value);
      }}
      placeholder="Search crochet items..."
      aria-label="Search crochet items"
      className={`mx-auto block w-full max-w-md rounded-full border-2 border-mustard bg-white px-4 py-2 text-cocoa shadow-sm transition-all placeholder:text-cocoa/40 focus:outline-none focus:ring-2 focus:ring-mustard sm:max-w-2xl sm:px-6 sm:py-3 sm:text-base lg:max-w-3xl ${className}`}
    />
  );
}
