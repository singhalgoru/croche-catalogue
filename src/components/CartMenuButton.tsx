interface Props {
  itemCount: number;
  updateCount?: number;
  onClick: () => void;
  className?: string;
}

export default function CartMenuButton({ itemCount, updateCount = 0, onClick, className = 'relative' }: Props) {
  return <button key={updateCount} type="button" onClick={onClick}
    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cocoa text-cream shadow-md transition-colors hover:bg-cocoa-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa ${updateCount > 0 ? 'cart-updated' : ''} ${className}`}
    aria-label={`Open cart with ${itemCount} item${itemCount === 1 ? '' : 's'}`}>
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" />
      <path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H7" />
    </svg>
    {itemCount > 0 && <span className="absolute -right-1.5 -top-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-mustard px-1 text-xs font-bold text-cocoa">{itemCount}</span>}
  </button>;
}
