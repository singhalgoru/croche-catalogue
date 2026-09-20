import type { ChangeEventHandler } from 'react';

interface Props {
  label: string;
  file: File | null;
  onChange: ChangeEventHandler<HTMLInputElement>;
  required?: boolean;
  disabled?: boolean;
}

export default function ImageFilePicker({
  label,
  file,
  onChange,
  required = false,
  disabled = false,
}: Props) {
  return (
    <div>
      <span className="text-sm font-semibold text-cocoa">{label}</span>
      <label
        className={`mt-1 flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-3 py-2 transition-colors ${
          file
            ? 'border-green-300 bg-green-50'
            : 'border-mustard/70 bg-white hover:border-mustard hover:bg-mustard/10'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onChange}
          required={required}
          disabled={disabled}
          aria-label={label}
          className="sr-only"
        />
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mustard/25 text-cocoa">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="8.5" cy="9" r="1.5" />
            <path d="m4 17 5-5 4 4 2-2 5 5" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-cocoa">
            {file?.name ?? 'Browse image'}
          </span>
          <span className="mt-0.5 block text-xs font-normal text-cocoa/55">
            {file ? 'Tap to choose a different image' : 'JPG, PNG or WebP · Max 6 MB'}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-cocoa px-3 py-1.5 text-xs font-semibold text-cream">
          {file ? 'Change' : 'Browse'}
        </span>
      </label>
    </div>
  );
}
