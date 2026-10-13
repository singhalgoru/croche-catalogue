interface Props {
  value: string;
  onChange: (value: string) => void;
  onSearch?: (value: string) => void;
}

export default function SearchBar({ value, onChange, onSearch }: Props) {
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
      className="w-full max-w-md mx-auto block px-4 py-2 rounded-full border-2 border-mustard bg-white text-cocoa placeholder:text-cocoa/40 focus:outline-none focus:ring-2 focus:ring-mustard"
    />
  );
}
