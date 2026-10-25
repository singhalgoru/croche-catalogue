import { useEffect, useState } from 'react';

interface Props {
  cartItemCount: number;
  accountName?: string | null;
  onOpenCart?: () => void;
  onOpenAccount?: (mode: 'signin' | 'signup') => void;
  onOpenMore: () => void;
  moreOpen: boolean;
  moreControls: string;
}

export default function MobileNavigation({ cartItemCount, accountName, onOpenCart, onOpenAccount, onOpenMore, moreOpen, moreControls }: Props) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    let fullHeight = window.innerHeight;
    const update = () => {
      const focused = document.activeElement;
      const editing = focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement
        || (focused instanceof HTMLElement && focused.isContentEditable);
      if (!editing) fullHeight = Math.max(fullHeight, window.innerHeight);
      setKeyboardOpen(editing && fullHeight - Math.min(window.innerHeight, viewport?.height ?? window.innerHeight) > 150);
    };
    const resetHeight = () => { fullHeight = window.innerHeight; update(); };
    viewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', resetHeight);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    update();
    return () => {
      viewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', resetHeight);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);
  const pathname = window.location.pathname;
  const checkout = new URLSearchParams(window.location.search).get('checkout');
  if (checkout && checkout !== 'cart') return null;
  const itemClass = 'relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold text-cocoa focus-visible:outline-2 focus-visible:outline-cocoa';
  const icon = (path: string) => <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d={path} /></svg>;
  return <nav aria-label="Mobile navigation" hidden={keyboardOpen}
    className="mobile-navigation fixed inset-x-0 bottom-0 z-[80] h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-mustard/30 bg-cream px-2 pt-1 pb-[env(safe-area-inset-bottom)] shadow-lg sm:hidden">
    <div className="grid grid-cols-5 gap-1">
      <a href="/" aria-current={pathname === '/' && !window.location.search ? 'page' : undefined} className={itemClass}>{icon('m3 10 9-7 9 7v11h-6v-7H9v7H3z')}Home</a>
      <a href="/collections/" aria-current={pathname.startsWith('/collections/') ? 'page' : undefined} className={itemClass}>{icon('M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z')}Collections</a>
      <button type="button" onClick={onOpenCart} disabled={!onOpenCart} aria-current={checkout === 'cart' ? 'page' : undefined} aria-label={`Open cart with ${cartItemCount} item${cartItemCount === 1 ? '' : 's'}`} className={itemClass}>
        {icon('M3 4h2l3 12h11l2-8H6M9 20h.01M18 20h.01')}
        {cartItemCount > 0 && <span className="absolute right-2 top-0 rounded-full bg-mustard px-1.5 text-[10px]">{cartItemCount}</span>}Cart
      </button>
      <button type="button" onClick={() => onOpenAccount?.('signin')} disabled={!onOpenAccount}
        aria-label={accountName ? `My account, signed in as ${accountName}` : 'Sign in or create account'} className={itemClass}>
        {accountName ? <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-mustard text-xs uppercase">{accountName.trim().charAt(0)}</span> : icon('M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21c0-9 16-9 16 0')}Account
      </button>
      <button type="button" aria-label={moreOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={moreOpen} aria-controls={moreControls} onClick={onOpenMore} className={itemClass}>
        {icon(moreOpen ? 'm6 6 12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16')}More
      </button>
    </div>
  </nav>;
}
