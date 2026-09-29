interface Props {
  className?: string;
}

const LOGO_SRC = `${import.meta.env.BASE_URL}images/luvia-logo-160.webp`;

// Small logo shown once the main header has scrolled away, so the brand stays
// in view while browsing. Doubles as a quick way back to the top.
export default function BrandMark({ className = '' }: Props) {
  const scrollToTop = () => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Luvia — back to top"
      title="Back to top"
      className={`shrink-0 overflow-hidden rounded-full bg-white shadow-md ring-2 ring-white transition-transform hover:scale-105 focus:outline-none focus-visible:ring-mustard ${className}`}
    >
      <img
        src={LOGO_SRC}
        alt=""
        width={160}
        height={160}
        decoding="async"
        draggable={false}
        className="h-full w-full object-cover"
      />
    </button>
  );
}
