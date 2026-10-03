import { useEffect, useState } from 'react';
import InstallAppButton from './InstallAppButton';

const DEFAULT_TICKER_MESSAGES = ['🚚 Shipping available across India'];

interface Props {
  showShippingTicker?: boolean;
  showInstallPrompt?: boolean;
  compact?: boolean;
  cartItemCount?: number;
  cartUpdateCount?: number;
  onOpenCart?: () => void;
  tickerMessages?: string[];
}

export default function Header({
  showShippingTicker = true,
  showInstallPrompt = true,
  compact = false,
  cartItemCount = 0,
  cartUpdateCount = 0,
  onOpenCart,
  tickerMessages = DEFAULT_TICKER_MESSAGES,
}: Props) {
  const [tickerIndex, setTickerIndex] = useState(0);
  const messages = tickerMessages.length > 0 ? tickerMessages : DEFAULT_TICKER_MESSAGES;
  const tickerMessage = messages[tickerIndex % messages.length];

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
      {onOpenCart && (
        <div className="relative z-50 mx-auto h-0 max-w-6xl">
          <button
            key={cartUpdateCount}
            type="button"
            onClick={onOpenCart}
            className={`right-4 flex h-12 w-12 items-center justify-center rounded-full bg-cocoa text-cream shadow-md transition-colors hover:bg-cocoa-dark sm:right-6 ${
              cartUpdateCount > 0 ? 'cart-updated' : ''
            } ${
              cartItemCount > 0
                ? 'fixed top-12 z-[70]'
                : 'absolute top-3'
            }`}
            aria-label={`Open cart with ${cartItemCount} item${cartItemCount === 1 ? '' : 's'}`}
          >
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
            </svg>
            {cartItemCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-mustard px-1 text-xs font-bold text-cocoa">
                {cartItemCount}
              </span>
            )}
          </button>
        </div>
      )}
      <div
        className={`max-w-6xl mx-auto px-4 flex items-center text-center ${
          compact
            ? 'flex-row justify-center gap-3 py-3'
            : 'flex-col gap-3 py-4 sm:py-8'
        }`}
      >
        <div className={compact ? 'contents' : 'flex w-full items-center gap-3 pr-16 text-left sm:contents'}>
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
              ? 'h-12 w-12 ring-2'
              : 'h-12 w-12 shrink-0 ring-4 sm:h-36 sm:w-36 md:h-44 md:w-44'
          }`}
          />
        </div>
        <h1
          className={`font-heading font-extrabold text-cocoa ${
            compact ? 'text-lg sm:text-xl' : 'text-lg leading-snug sm:text-3xl'
          }`}
        >
          Handmade Crochet Products &amp; Gifts
        </h1>
        {!compact && (
          <p className="text-cocoa/80 text-sm max-w-md font-medium px-2">
            <span className="sm:hidden">Made with love. Delivered across India.</span>
            <span className="hidden sm:inline">
              Explore handmade crochet accessories, gifts, toys and decor by Luvia.
              Every piece is stitched with love and shipped across India.
            </span>
          </p>
        )}
        {showInstallPrompt && <InstallAppButton />}
      </div>
    </header>
  );
}
