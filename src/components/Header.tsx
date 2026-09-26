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
        <div className="relative z-10 mx-auto h-0 max-w-6xl">
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
            : 'flex-col gap-3 py-6 sm:py-8'
        }`}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/luvia-logo.jpg`}
          alt="Luvia — Crochet, Accessories & More, made with love"
          className={`rounded-full object-cover shadow-lg ring-white ${
            compact
              ? 'h-12 w-12 ring-2'
              : 'h-28 w-28 ring-4 sm:h-36 sm:w-36 md:h-44 md:w-44'
          }`}
        />
        <h1
          className={`font-heading font-extrabold text-cocoa ${
            compact ? 'text-lg sm:text-xl' : 'text-2xl sm:text-3xl'
          }`}
        >
          Handmade Crochet Products &amp; Gifts
        </h1>
        {!compact && (
          <p className="text-cocoa/80 text-sm max-w-md font-medium px-2">
            Explore handmade crochet accessories, gifts, bags, toys and decor by Luvia.
            Every piece is stitched with love and shipped across India.
          </p>
        )}
        {showInstallPrompt && <InstallAppButton />}
      </div>
    </header>
  );
}
