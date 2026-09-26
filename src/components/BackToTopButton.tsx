import { useEffect, useState } from 'react';

const VISIBILITY_OFFSET = 500;

export default function BackToTopButton() {
  const [isVisible, setIsVisible] = useState(window.scrollY > VISIBILITY_OFFSET);

  useEffect(() => {
    const updateVisibility = () => setIsVisible(window.scrollY > VISIBILITY_OFFSET);
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateVisibility);
  }, []);

  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        })
      }
      aria-label="Go to top"
      title="Go to top"
      className="fixed bottom-5 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border-2 border-mustard bg-cocoa text-cream shadow-lg transition-colors hover:bg-cocoa-dark sm:bottom-6 sm:right-6"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 14 6-6 6 6" />
      </svg>
    </button>
  );
}
