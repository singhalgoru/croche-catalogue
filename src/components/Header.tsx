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
  categories?: string[];
  onNavigateCatalogue?: (category?: string) => void;
  collectionPages?: boolean;
  mobileCartInToolbar?: boolean;
  hideMobileCart?: boolean;
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
  categories = [],
  onNavigateCatalogue,
  collectionPages = false,
  mobileCartInToolbar = false,
  hideMobileCart = false,
}: Props) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [tickerIndex, setTickerIndex] = useState(0);
  const messages = tickerMessages.length > 0 ? tickerMessages : DEFAULT_TICKER_MESSAGES;
  const tickerMessage = messages[tickerIndex % messages.length];
  const navigateCatalogue = (event: MouseEvent<HTMLAnchorElement>, category?: string) => {
    if (!onNavigateCatalogue || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    setIsMenuOpen(false);
    onNavigateCatalogue(category);
  };

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (messages.length < 2) return;
    const timer = window.setInterval(
      () => setTickerIndex((current) => (current + 1) % messages.length),
      6000,
    );
    return () => window.clearInterval(timer);
  }, [messages.length]);

  return (
    <header className="bg-cream border-b-4 border-mustard">
      {showShippingTicker && (
        <div
          className="shipping-ticker overflow-hidden bg-cocoa py-2 text-sm font-bold text-cream"
          aria-label="Store announcements"
        >
          <div className="shipping-ticker-track" key={`${tickerIndex}-${tickerMessage}`}>
            <span>{tickerMessage}</span>
            <span aria-hidden="true">{tickerMessage}</span>
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
            onClick={() => setIsMenuOpen((open) => !open)}
            className={`absolute top-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-cocoa shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa ${
              onOpenCart ? 'right-20 sm:right-24' : 'right-4 sm:right-6'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {isMenuOpen ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
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
              {categories.length > 0 && <p className="px-3 pt-3 text-xs font-bold uppercase text-cocoa/70">Collections</p>}
              {categories.map((category) => (
                <a key={category} href={collectionPages ? collectionPath(category) : `${import.meta.env.BASE_URL}?category=${encodeURIComponent(category)}`}
                  onClick={event => navigateCatalogue(event, category)}
                  className="block rounded-lg px-3 py-3 hover:bg-cream focus-visible:outline-cocoa">
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
              <a href="#collaborate" className="block rounded-lg px-3 py-3 hover:bg-cream focus-visible:outline-cocoa">Collaborate with us</a>
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
            ? `flex-row gap-3 py-3 ${alignLogoLeft ? 'justify-start pr-36 text-left' : 'justify-center'}`
            : 'flex-col gap-3 py-3 sm:py-8'
        }`}
      >
        <div className={compact ? 'contents' : 'flex w-full items-center gap-3 pr-32 text-left sm:contents'}>
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
