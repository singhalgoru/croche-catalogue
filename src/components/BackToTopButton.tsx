import { useEffect, useState } from 'react';

const VISIBILITY_OFFSET = 500;

export default function BackToTopButton({ raised = false }: { raised?: boolean }) {
  const [isVisible, setIsVisible] = useState(window.scrollY > VISIBILITY_OFFSET);
  const [barHeight, setBarHeight] = useState(0);

  useEffect(() => {
    const updateVisibility = () => setIsVisible(window.scrollY > VISIBILITY_OFFSET);
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateVisibility);
  }, []);

  useEffect(() => {
    if (!raised || !isVisible) return;
    const bar = document.querySelector('[aria-label="Product purchase actions"]');
    if (!bar) return;
    const measure = () => setBarHeight(bar.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [raised, isVisible]);

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
      style={raised && barHeight ? { bottom: `${barHeight + 12}px` } : undefined}
      className={`fixed right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border-2 border-mustard bg-cocoa text-cream shadow-lg transition-colors hover:bg-cocoa-dark sm:right-6 ${
        raised
          ? 'bottom-[calc(10rem+env(safe-area-inset-bottom))]'
          : 'bottom-[calc(1.25rem+env(safe-area-inset-bottom))] sm:bottom-6'
      }`}
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
