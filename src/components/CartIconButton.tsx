interface Props {
  productName: string;
  status: 'idle' | 'busy' | 'added' | 'error';
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  quantity?: number;
}

const statusLabel = {
  idle: 'Add to cart',
  busy: 'Adding…',
  added: 'Added!',
  error: 'Try again',
};

export default function CartIconButton({
  productName,
  status,
  onClick,
  disabled = false,
  className = '',
  quantity = 0,
}: Props) {
  const label = statusLabel[status];

  return (
    <div className={`group/cart absolute z-20 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex h-11 w-11 items-center justify-center rounded-full border border-white/70 text-white shadow-lg backdrop-blur-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          status === 'added'
            ? 'bg-green-600/95 hover:bg-green-700'
            : 'bg-cocoa/95 hover:bg-cocoa-dark'
        }`}
        aria-label={`${label} — ${productName}${
          quantity > 0 ? ` (${quantity} in cart)` : ''
        }`}
      >
        {status === 'added' ? (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path d="m5 12 4 4L19 6" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="9" cy="20" r="1" />
            <circle cx="18" cy="20" r="1" />
            <path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H7" />
            <path d="M14 9v4M12 11h4" />
          </svg>
        )}
        {quantity > 0 && (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-mustard px-1 text-xs font-extrabold leading-none text-cocoa shadow-md"
            aria-label={`${quantity} in cart`}
          >
            {quantity > 99 ? '99+' : quantity}
          </span>
        )}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-lg bg-cocoa px-2.5 py-1.5 text-xs font-semibold text-cream opacity-0 shadow-lg transition-opacity group-hover/cart:opacity-100 group-focus-within/cart:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}
