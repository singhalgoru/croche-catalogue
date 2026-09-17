interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: Props) {
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Search crochet items..."
      aria-label="Search crochet items"
      className="w-full max-w-md mx-auto block px-4 py-2 rounded-full border border-rose-300 bg-white text-rose-900 placeholder:text-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400"
    />
  );
}
