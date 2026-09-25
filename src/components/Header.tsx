import InstallAppButton from './InstallAppButton';

interface Props {
  showShippingTicker?: boolean;
  showInstallPrompt?: boolean;
  cartItemCount?: number;
  onOpenCart?: () => void;
}

export default function Header({
  showShippingTicker = true,
  showInstallPrompt = true,
  cartItemCount = 0,
  onOpenCart,
}: Props) {
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
      {onOpenCart && (
        <div className="relative z-10 mx-auto h-0 max-w-6xl">
          <button
            type="button"
            onClick={onOpenCart}
            className={`right-4 rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream shadow-md transition-colors hover:bg-cocoa-dark sm:right-6 ${
              cartItemCount > 0
                ? 'fixed top-12 z-[70]'
                : 'absolute top-3'
            }`}
            aria-label={`Open cart with ${cartItemCount} item${cartItemCount === 1 ? '' : 's'}`}
          >
            Cart
            {cartItemCount > 0 && (
              <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-mustard px-1.5 py-0.5 text-xs font-bold text-cocoa">
                {cartItemCount}
              </span>
            )}
          </button>
        </div>
      )}
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 flex flex-col items-center text-center gap-3">
        <img
          src={`${import.meta.env.BASE_URL}images/luvia-logo.jpg`}
          alt="Luvia — Crochet, Accessories & More, made with love"
          className="h-28 w-28 sm:h-36 sm:w-36 md:h-44 md:w-44 rounded-full object-cover shadow-lg ring-4 ring-white"
        />
        <h1 className="font-heading text-2xl font-extrabold text-cocoa sm:text-3xl">
          Handmade Crochet Products &amp; Gifts
        </h1>
        <p className="text-cocoa/80 text-sm max-w-md font-medium px-2">
          Explore handmade crochet accessories, gifts, bags, toys and decor by Luvia.
          Every piece is stitched with love and shipped across India.
        </p>
        {showInstallPrompt && <InstallAppButton />}
      </div>
    </header>
  );
}
