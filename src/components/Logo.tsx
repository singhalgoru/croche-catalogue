interface Props {
  className?: string;
}

/**
 * Simple wave-themed mark for "Luvia" — a crocheted yarn loop riding a wave,
 * echoing the brand's "Love flowing through every creation" tagline.
 */
export default function Logo({ className = 'h-10 w-10' }: Props) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Luvia logo">
      <defs>
        <linearGradient id="luvia-wave" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="#fff0e9" />
      <path
        d="M4 38c6-6 12 6 18 0s12-6 18 0 12 6 18 0"
        fill="none"
        stroke="url(#luvia-wave)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M4 48c6-6 12 6 18 0s12-6 18 0 12 6 18 0"
        fill="none"
        stroke="#f6c453"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      />
      <circle cx="32" cy="20" r="9" fill="#e07a5f" />
      <path
        d="M26 20a6 6 0 0 1 12 0M27 16a6 6 0 0 1 10 8"
        fill="none"
        stroke="#fff0e9"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
