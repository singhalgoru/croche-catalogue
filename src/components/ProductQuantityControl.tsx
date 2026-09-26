interface Props {
  productName: string;
  variantName: string;
  quantity: number;
  disabled?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
  overlay?: boolean;
}

export default function ProductQuantityControl({
  productName,
  variantName,
  quantity,
  disabled = false,
  onDecrease,
  onIncrease,
  onRemove,
  overlay = true,
}: Props) {
  const itemName = `${productName} — ${variantName}`;

  return (
    <div
      className={`flex items-center gap-1 rounded-full border border-white/70 bg-cocoa/95 p-1 text-cream shadow-lg backdrop-blur-md ${
        overlay ? 'absolute bottom-3 right-16 z-20' : 'relative shrink-0'
      }`}
    >
      <button
        type="button"
        onClick={onDecrease}
        disabled={disabled || quantity <= 1}
        className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-35"
        aria-label={`Decrease quantity of ${itemName}`}
      >
        −
      </button>
      <span
        className="min-w-7 text-center text-sm font-extrabold"
        aria-label={`${quantity} of ${itemName} in cart`}
      >
        {quantity}
      </span>
      <button
        type="button"
        onClick={onIncrease}
        disabled={disabled || quantity >= 99}
        className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-35"
        aria-label={`Increase quantity of ${itemName}`}
      >
        +
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="flex h-9 w-9 items-center justify-center rounded-full text-red-200 hover:bg-red-500/25 disabled:opacity-35"
        aria-label={`Remove ${itemName} from cart`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6" />
        </svg>
      </button>
    </div>
  );
}
