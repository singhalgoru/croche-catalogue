interface Props {
  showShippingTicker?: boolean;
}

export default function Header({ showShippingTicker = true }: Props) {
  return (
    <header className="bg-cream border-b-4 border-mustard">
      {showShippingTicker && (
        <div
          className="shipping-ticker overflow-hidden bg-cocoa py-2 text-sm font-bold text-cream"
          aria-label="Shipping available across India"
        >
          <div className="shipping-ticker-track">
            <span>🚚 Shipping available across India</span>
            <span aria-hidden="true">🚚 Shipping available across India</span>
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 flex flex-col items-center text-center gap-3">
        <img
          src={`${import.meta.env.BASE_URL}images/luvia-logo.jpg`}
          alt="Luvia — Crochet, Accessories & More, made with love"
          className="h-28 w-28 sm:h-36 sm:w-36 md:h-44 md:w-44 rounded-full object-cover shadow-lg ring-4 ring-white"
        />
        <p className="text-cocoa/80 text-sm max-w-md font-medium px-2">
          Browse our handmade crochet catalogue — every piece stitched with love.
        </p>
      </div>
    </header>
  );
}
