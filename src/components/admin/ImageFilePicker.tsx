import type { ChangeEventHandler, ReactNode } from 'react';
import RequiredMark from './RequiredMark';

interface Props {
  label: string;
  file: File | null;
  onChange: ChangeEventHandler<HTMLInputElement>;
  required?: boolean;
  disabled?: boolean;
  showRequiredMark?: boolean;
  maxSizeMB?: number;
  icon?: ReactNode;
  multiple?: boolean;
}

export function ImagePickerHandIcon() {
  return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 11V4a2 2 0 0 1 4 0v5h1a2 2 0 0 1 2 2h1a2 2 0 0 1 2 2h1a2 2 0 0 1 2 2v2a5 5 0 0 1-5 5h-3a5 5 0 0 1-4-2L4 14a2 2 0 0 1 3-2l1 1z" />
  </svg>;
}

export default function ImageFilePicker({
  label,
  file,
  onChange,
  required = false,
  disabled = false,
  showRequiredMark = required,
  maxSizeMB = 6,
  icon,
  multiple = false,
}: Props) {
  return (
    <div className="min-w-0">
      <span className="text-sm font-semibold text-cocoa">{label}{showRequiredMark && <RequiredMark />}</span>
      <label
        className={`mt-1 flex min-h-16 min-w-0 max-w-full cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-3 py-2 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-cocoa ${
          file
            ? 'border-green-300 bg-green-50'
            : 'border-mustard/70 bg-white hover:border-mustard hover:bg-mustard/10'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple={multiple}
          onChange={onChange}
          required={required}
          disabled={disabled}
          aria-label={label}
          className="sr-only"
        />
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mustard/25 text-cocoa">
          {icon ?? <svg
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
          </svg>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-cocoa">
            {file?.name ?? (multiple ? 'Browse images' : 'Browse image')}
          </span>
          <span className="mt-0.5 block text-xs font-normal text-cocoa/55">
            {file ? 'Tap to choose a different image' : `JPG, PNG or WebP · Max ${maxSizeMB} MB`}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-cocoa px-3 py-1.5 text-xs font-semibold text-cream">
          {file ? 'Change' : 'Browse'}
        </span>
      </label>
    </div>
  );
}
