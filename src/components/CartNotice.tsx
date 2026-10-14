interface Props {
  message: string;
  onDismiss?: () => void;
}

export default function CartNotice({ message, onDismiss }: Props) {
  const stock = /^(?:Unable to (?:add this product to your cart|update the cart quantity): )?Only (\d+) available for (.+)\. Please reduce the quantity or remove this item\.$/.exec(message);
  const quantity = stock ? Number(stock[1]) : null;
  return (
    <div role="alert" className={`flex items-start gap-3 rounded-2xl border p-4 shadow-lg ${
      stock ? 'border-mustard bg-cream text-cocoa' : 'border-red-200 bg-red-50 text-red-800'
    }`}>
      <div className="min-w-0 flex-1">
        {stock ? <>
          <p className="font-heading text-base font-bold">{quantity === 0 ? 'Currently unavailable' : 'Available quantity'}</p>
          <p className="mt-1 break-words text-sm">{quantity === 0
            ? `${stock[2]} is currently unavailable. Please remove it from your cart or explore another handmade favourite.`
            : `We currently have ${quantity} ${quantity === 1 ? 'piece' : 'pieces'} of ${stock[2]} available. Your cart has not changed.`}</p>
          {quantity !== 0 && <p className="mt-2 text-xs text-cocoa/75">You can review the quantity in your cart.</p>}
        </> : <p className="break-words text-sm">{message}</p>}
      </div>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss cart error"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-current/20 hover:bg-cocoa/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>}
    </div>
  );
}
