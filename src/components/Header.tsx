import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import InstallAppButton from './InstallAppButton';
import CartMenuButton from './CartMenuButton';
import { collectionPath } from '../utils/collectionLink.js';

const DEFAULT_TICKER_MESSAGES = ['🚚 Shipping available across India'];

interface Props {
  showShippingTicker?: boolean;
  showInstallPrompt?: boolean;
  compact?: boolean;
  showHeading?: boolean;
  alignLogoLeft?: boolean;
  cartItemCount?: number;
  cartUpdateCount?: number;
  onOpenCart?: () => void;
  tickerMessages?: string[];
  seasonalAnnouncement?: { name: string; text: string };
  categories?: string[];
  seasonalCategories?: string[];
  onNavigateCatalogue?: (category?: string) => void;
  mobileCartInToolbar?: boolean;
  hideMobileCart?: boolean;
  onOpenAccount?: (mode: 'signin' | 'signup') => void;
  onOpenOrders?: () => void;
  accountName?: string | null;
  showCollaborationLink?: boolean;
}

export default function Header({
  showShippingTicker = true,
  showInstallPrompt = true,
  compact = false,
  showHeading = true,
  alignLogoLeft = false,
  cartItemCount = 0,
  cartUpdateCount = 0,
  onOpenCart,
  tickerMessages = DEFAULT_TICKER_MESSAGES,
  seasonalAnnouncement,
  categories = [],
  seasonalCategories = [],
  onNavigateCatalogue,
  mobileCartInToolbar = false,
  hideMobileCart = false,
  onOpenAccount,
  onOpenOrders,
  accountName,
  showCollaborationLink = true,
}: Props) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [signOutMessage, setSignOutMessage] = useState('');
  const signOutPending = useRef(false);
  const signOut = async () => {
    if (signOutPending.current) return;
    signOutPending.current = true;
    setIsAccountMenuOpen(false);
    setIsMenuOpen(true);
    menuButtonRef.current?.focus();
    setIsSigningOut(true); setSignOutError(''); setSignOutMessage('');
    try {
      const { signOutCustomer } = await import('../services/customer');
      await signOutCustomer();
      setSignOutMessage('Signed out successfully.');
    } catch (failure) {
      setSignOutError(failure instanceof Error ? failure.message : 'Unable to sign out. Please retry.');
    } finally {
      signOutPending.current = false;
      setIsSigningOut(false);
    }
  };
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [tickerFocused, setTickerFocused] = useState(false);
  const [tickerHovered, setTickerHovered] = useState(false);
  const tickerTrackRef = useRef<HTMLDivElement>(null);
  const [tickerDuration, setTickerDuration] = useState(16);
  const baseMessages = tickerMessages.length > 0 ? tickerMessages : DEFAULT_TICKER_MESSAGES;
  const messages = seasonalAnnouncement ? [seasonalAnnouncement.text, ...baseMessages] : baseMessages;
  const tickerMessage = messages[tickerIndex % messages.length];
  const isSeasonalMessage = Boolean(seasonalAnnouncement && tickerMessage === seasonalAnnouncement.text);
  useEffect(() => {
    const track = tickerTrackRef.current;
    if (!track) return;
    const measure = () => {
      if (track.scrollWidth > 0) setTickerDuration(track.scrollWidth / 2 / 50);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    measure();
    return () => observer.disconnect();
  }, [tickerMessage, showShippingTicker]);
  const navigateCatalogue = (event: MouseEvent<HTMLAnchorElement>, category?: string) => {
    if (!onNavigateCatalogue || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    setIsMenuOpen(false);
    onNavigateCatalogue(category);
  };

  useEffect(() => {
    if (!isMenuOpen && !isAccountMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsMenuOpen(false);
      setIsAccountMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setIsMenuOpen(false);
        setIsAccountMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isMenuOpen, isAccountMenuOpen]);

  useEffect(() => {
    if (messages.length < 2 || tickerFocused || tickerHovered) return;
    const timer = window.setInterval(
      () => setTickerIndex((current) => (current + 1) % messages.length),
      tickerDuration * 1000,
    );
    return () => window.clearInterval(timer);
  }, [messages.length, tickerFocused, tickerHovered, tickerDuration]);

  return (
    <header className="bg-cream border-b-4 border-mustard">
      {showShippingTicker && (
        <div
          className="shipping-ticker overflow-hidden bg-cocoa py-2 text-sm font-bold text-cream"
          aria-label="Store announcements"
          onFocus={() => setTickerFocused(true)}
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setTickerFocused(false); }}
          onMouseEnter={() => setTickerHovered(true)}
          onMouseLeave={() => setTickerHovered(false)}
        >
          <div ref={tickerTrackRef} style={{ animationDuration: `${tickerDuration}s` }}
            className={`shipping-ticker-track ${isSeasonalMessage ? 'shipping-ticker-featured' : ''}`} key={`${tickerIndex}-${tickerMessage}`}>
            {seasonalAnnouncement && tickerMessage === seasonalAnnouncement.text
              ? <a href={collectionPath(seasonalAnnouncement.name)} className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-cream">{tickerMessage}</a>
              : <span>{tickerMessage}</span>}
            {seasonalAnnouncement && tickerMessage === seasonalAnnouncement.text
              ? <a href={collectionPath(seasonalAnnouncement.name)} aria-hidden="true" tabIndex={-1} className="underline underline-offset-4">{tickerMessage}</a>
              : <span aria-hidden="true">{tickerMessage}</span>}
          </div>
        </div>
      )}
      <div className="relative z-[80] mx-auto h-0 w-full max-w-6xl">
        <div ref={menuRef}>
          <button
            ref={menuButtonRef}
            type="button"
            aria-label={isMenuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={isMenuOpen}
            aria-controls={menuId}
            onClick={() => { setIsAccountMenuOpen(false); setIsMenuOpen(open => !open); }}
            className={`absolute top-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-cocoa shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa ${
              onOpenCart ? 'right-20 sm:right-24' : 'right-4 sm:right-6'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {isMenuOpen ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
          {onOpenAccount && (
            <button
              type="button"
              aria-label={accountName ? `My account, signed in as ${accountName}` : 'Sign in or create account'}
              title={accountName ? `Signed in as ${accountName}` : 'Sign in or create account'}
              aria-expanded={accountName ? isAccountMenuOpen : undefined}
              onClick={() => { setIsMenuOpen(false); if (accountName) setIsAccountMenuOpen(open => !open); else onOpenAccount('signin'); }}
              className={`absolute top-3 flex h-12 min-w-12 items-center justify-center gap-2 rounded-full bg-white text-cocoa shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa ${
                accountName ? 'sm:max-w-56 sm:px-4' : ''} ${onOpenCart ? 'right-36 sm:right-[10.5rem]' : 'right-20 sm:right-24'
              }`}
            >
              {accountName ? <>
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cocoa font-bold uppercase text-white sm:h-7 sm:w-7 sm:text-sm">
                  {accountName.charAt(0)}
                </span>
                <span aria-hidden="true" className="hidden truncate font-semibold sm:inline">Hi, {accountName}</span>
              </> : <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
              </svg>}
            </button>
          )}
          {isAccountMenuOpen && accountName && onOpenAccount && <nav aria-label="Account navigation"
            className="absolute right-4 top-16 w-64 rounded-xl border border-mustard/30 bg-white p-3 text-cocoa shadow-xl sm:right-6">
            <button type="button" className="block min-h-11 w-full rounded-lg px-3 text-left hover:bg-cream"
              onClick={() => { setIsAccountMenuOpen(false); onOpenAccount('signin'); }}>My account</button>
            {onOpenOrders && <button type="button" className="block min-h-11 w-full rounded-lg px-3 text-left hover:bg-cream"
              onClick={() => { setIsAccountMenuOpen(false); onOpenOrders(); }}>My orders</button>}
            <button type="button" disabled={isSigningOut} className="block min-h-11 w-full rounded-lg px-3 text-left hover:bg-cream"
              onClick={() => { setIsAccountMenuOpen(false); void signOut(); }}>Sign out</button>
          </nav>}
          {isMenuOpen && (
            <nav
              id={menuId}
              aria-label="Main navigation"
              onClick={(event) => {
                if (event.target instanceof Element && event.target.closest('a')) setIsMenuOpen(false);
              }}
              onBlur={(event) => {
                if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setIsMenuOpen(false);
              }}
              className="absolute right-4 top-16 max-h-[70vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-mustard/30 bg-white p-3 text-cocoa shadow-xl sm:right-6"
            >
              <a href={import.meta.env.BASE_URL} onClick={event => navigateCatalogue(event)} className="block rounded-lg px-3 py-3 font-semibold hover:bg-cream focus-visible:outline-cocoa">Home</a>
              {onOpenAccount && (accountName ? <div className="px-1 py-2">
                <p className="truncate px-2 text-sm text-cocoa/70">Signed in as <span className="font-semibold text-cocoa">{accountName}</span></p>
                <button type="button" onClick={() => { setIsMenuOpen(false); onOpenAccount('signin'); }}
                  className="mt-2 min-h-11 w-full rounded-full border border-cocoa px-3 font-semibold hover:bg-cream">My account</button>
                {onOpenOrders && <button type="button" onClick={() => { setIsMenuOpen(false); onOpenOrders(); }}
                  className="mt-2 min-h-11 w-full rounded-full border border-cocoa px-3 font-semibold hover:bg-cream">My orders</button>}
                <button type="button" disabled={isSigningOut} onClick={() => { void signOut(); }}
                  className="mt-2 min-h-11 w-full rounded-full border border-cocoa/30 px-3 font-semibold hover:bg-cream disabled:opacity-50">
                  {isSigningOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div> : <div className="grid grid-cols-2 gap-2 px-1 py-2">
                <button type="button" onClick={() => { setIsMenuOpen(false); onOpenAccount('signin'); }}
                  className="min-h-11 rounded-full border border-cocoa px-3 font-semibold hover:bg-cream">Sign in</button>
                <button type="button" onClick={() => { setIsMenuOpen(false); onOpenAccount('signup'); }}
                  className="min-h-11 rounded-full bg-cocoa px-3 font-semibold text-white">Create account</button>
              </div>)}
              {signOutError && <p role="alert" className="px-3 py-2 text-sm text-red-700">{signOutError}</p>}
              {signOutMessage && <p role="status" className="px-3 py-2 text-sm text-green-800">{signOutMessage}</p>}
              {categories.length > 0 && <p className="px-3 pt-3 text-xs font-bold uppercase text-cocoa/70">Collections</p>}
              {categories.map((category) => (
                <a key={category} href={collectionPath(category)}
                  className={`block rounded-lg px-3 py-3 focus-visible:outline-cocoa ${seasonalCategories.includes(category) ? 'bg-mustard text-cocoa font-semibold hover:bg-mustard/80' : 'hover:bg-cream'}`}>
                  {category}
                </a>
              ))}
              <a href={`${import.meta.env.BASE_URL}return-policy/`}
                className="mt-2 block rounded-lg border-t border-mustard/30 px-3 py-3 hover:bg-cream focus-visible:outline-cocoa">
                Return and refund policy
              </a>
              <a href={`${import.meta.env.BASE_URL}collections/`} className="block rounded-lg px-3 py-3 hover:bg-cream">Explore collection pages</a>
              <a href={`${import.meta.env.BASE_URL}about/`} className="block rounded-lg px-3 py-3 hover:bg-cream">About &amp; contact</a>
              <a href={`${import.meta.env.BASE_URL}faq/`} className="block rounded-lg px-3 py-3 hover:bg-cream">Ordering FAQ</a>
              {showCollaborationLink && <a href="#collaborate" className="block rounded-lg px-3 py-3 hover:bg-cream focus-visible:outline-cocoa">Collaborate with us</a>}
            </nav>
          )}
        </div>
      </div>
      {onOpenCart && (
        <div className={`relative z-50 mx-auto h-0 max-w-6xl ${hideMobileCart ? 'hidden sm:block' : ''}`}>
          <CartMenuButton itemCount={cartItemCount} updateCount={cartUpdateCount}
            onClick={() => {
              setIsMenuOpen(false);
              onOpenCart();
            }}
            className={`right-4 sm:right-6 ${
              cartItemCount > 0
                ? mobileCartInToolbar ? 'absolute top-3 sm:fixed sm:top-12 sm:z-[70]' : 'fixed top-12 z-[70]'
                : 'absolute top-3'
            }`}
          />
        </div>
      )}
      <div
        className={`max-w-6xl mx-auto px-4 flex items-center text-center ${
          compact
            ? `flex-row gap-3 py-3 ${alignLogoLeft ? `justify-start ${accountName ? 'pr-52 sm:pr-96' : onOpenAccount ? 'pr-52' : 'pr-36'} text-left` : 'justify-center'}`
            : 'flex-col gap-3 py-3 sm:py-8'
        }`}
      >
        <div className={compact ? 'contents' : `flex w-full items-center gap-3 ${onOpenAccount ? 'pr-52' : 'pr-32'} text-left sm:contents`}>
          <a
            href={import.meta.env.BASE_URL}
            onClick={event => navigateCatalogue(event)}
            aria-label="Luvia Creations — home"
            className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cocoa"
          >
          <img
          src={`${import.meta.env.BASE_URL}images/luvia-logo-320.webp`}
          srcSet={[160, 320, 480]
            .map((width) => `${import.meta.env.BASE_URL}images/luvia-logo-${width}.webp ${width}w`)
            .join(', ')}
          sizes={compact ? '48px' : '(min-width: 768px) 176px, (min-width: 640px) 144px, 48px'}
          width={320}
          height={320}
          alt="Luvia — Crochet, Accessories & More, made with love"
          className={`rounded-full object-cover shadow-lg ring-white ${
            compact
              ? 'h-12 w-12 ring-2 ring-inset'
              : 'h-12 w-12 shrink-0 ring-2 ring-inset sm:h-36 sm:w-36 sm:ring-4 sm:ring-outset md:h-44 md:w-44'
          }`}
          />
          </a>
          <a href={`${import.meta.env.BASE_URL}search/`} aria-label="Search products" title="Search products"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-cocoa shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" />
            </svg>
          </a>
        </div>
        {showHeading && <h1
          className={`font-heading font-extrabold text-cocoa ${
            compact ? 'text-lg sm:text-xl' : 'text-lg leading-snug sm:text-3xl'
          }`}
        >
          Premium Handmade Crochet Creations
        </h1>}
        {!compact && (
          <p className="text-cocoa/80 text-sm max-w-md font-medium px-2">
            <span className="sm:hidden">Thoughtfully made. Delivered across India.</span>
            <span className="hidden sm:inline">
              Discover thoughtfully crafted crochet accessories, gifts, toys and decor by Luvia.
              Handmade in India and shipped nationwide.
            </span>
          </p>
        )}
        {showInstallPrompt && <InstallAppButton />}
      </div>
    </header>
  );
}
