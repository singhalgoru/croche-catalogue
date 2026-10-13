import { Children, cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';

export default function RotatingCarousel({ title, label, children, itemCount, navigation = false, viewAll, description, pinned }: {
  title: string; label: string; children: ReactNode; itemCount: number;
  navigation?: boolean; viewAll?: string; description?: string; pinned?: ReactNode;
}) {
  const id = useId();
  const track = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [looping, setLooping] = useState(false);
  const cards = Children.toArray(children);
  const loopWidth = useRef(0);
  const scrollOffset = useRef(0);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  const measure = useCallback(() => {
    const element = track.current;
    if (element) {
      const first = element.querySelector('a');
      const gap = parseFloat(getComputedStyle(element).columnGap || '0');
      loopWidth.current = first ? (first.getBoundingClientRect().width + gap) * cards.length : 0;
      if (first) element.parentElement?.style.setProperty('--carousel-image-center', `${first.getBoundingClientRect().width / 2}px`);
      const pinnedElement = element.querySelector<HTMLElement>('[data-pinned="true"]');
      if (pinnedElement) {
        element.parentElement?.style.setProperty('--carousel-pinned-width', `${pinnedElement.getBoundingClientRect().width}px`);
      }
      setLooping(cards.length > 1);
      if (Math.abs(element.scrollLeft - scrollOffset.current) > 2) {
        scrollOffset.current = element.scrollLeft;
      }
      setEdges({ start: element.scrollLeft <= 1,
        end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 1 });
    }
  }, [cards.length]);
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const card of element.children) observer.observe(card);
    return () => observer.disconnect();
  }, [itemCount, looping, measure]);
  useEffect(() => {
    if (paused || hovered || focused || touched || reducedMotion || !looping) return;
    let animation: number;
    let previous: number | undefined;
    const glide = (now: number) => {
      const element = track.current;
      if (element && previous !== undefined && document.visibilityState === 'visible' && loopWidth.current > 0) {
        const distance = Math.min(now - previous, 100) * 26 / 1000;
        scrollOffset.current += distance;
        if (scrollOffset.current >= loopWidth.current) {
          scrollOffset.current %= loopWidth.current;
        }
        element.scrollLeft = scrollOffset.current;
      }
      previous = now;
      animation = window.requestAnimationFrame(glide);
    };
    animation = window.requestAnimationFrame(glide);
    return () => window.cancelAnimationFrame(animation);
  }, [paused, hovered, focused, touched, reducedMotion, looping]);
  const scroll = (direction: number) => {
    const element = track.current;
    if (element) {
      element.scrollBy({ left: direction * element.clientWidth * 0.8,
        behavior: reducedMotion ? 'instant' : 'smooth' });
    }
  };
  const Track = navigation ? 'nav' : 'div';
  return <section aria-labelledby={`${id}-heading`} className="relative min-w-0 space-y-3"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onTouchStart={() => setTouched(true)} onTouchEnd={() => setTouched(false)} onTouchCancel={() => setTouched(false)}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="flex items-center justify-between gap-3">
      <h2 id={`${id}-heading`} className="font-heading text-xl font-bold text-cocoa">{title}</h2>
      {viewAll && <a href={viewAll} className="text-sm font-semibold text-cocoa underline underline-offset-4">View all</a>}
      <button type="button" aria-label={paused || reducedMotion ? `Resume ${label} rotation` : `Pause ${label} rotation`}
        disabled={reducedMotion} aria-pressed={paused || reducedMotion} onClick={() => setPaused(current => !current)}
        className="sr-only rounded-full border border-cocoa/30 bg-cream text-sm text-cocoa focus:not-sr-only focus:absolute focus:right-0 focus:top-12 focus:z-10 focus:min-h-11 focus:min-w-11 disabled:opacity-40">
        {paused || reducedMotion ? 'Play' : 'Pause'}
      </button>
    </div>
    {description && <p className="text-sm text-cocoa/75">{description}</p>}
    <div className="relative min-w-0">
      <Track ref={element => { track.current = element; }} id={`${id}-track`} aria-label={title} role={navigation ? undefined : 'group'}
        onScroll={measure} className="no-scrollbar flex gap-3 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pinned && (
          <div data-pinned="true" className="sticky left-0 z-10 shrink-0 bg-cream w-[38%] sm:w-[calc((100%-36px)/4)] lg:w-[calc((100%-60px)/6)]">
            {pinned}
          </div>
        )}
        {cards}
        {looping && cards.map(card => isValidElement<HTMLAttributes<HTMLElement>>(card)
          ? cloneElement(card, { key: `loop-${card.key}`, 'aria-hidden': true, tabIndex: -1 }) : null)}
      </Track>
      <button type="button" aria-label={`Previous ${label}s`} aria-controls={`${id}-track`}
        disabled={edges.start} onClick={() => scroll(-1)}
        style={{ left: pinned ? 'calc(var(--carousel-pinned-width, 0px) + 8px)' : '8px' }}
        className="absolute top-[var(--carousel-image-center,50%)] z-20 hidden min-h-11 min-w-11 -translate-y-1/2 rounded-full border border-cocoa/30 bg-cream/95 text-cocoa shadow-sm disabled:opacity-40 sm:block">&#8592;</button>
      <button type="button" aria-label={`Next ${label}s`} aria-controls={`${id}-track`}
        disabled={edges.end} onClick={() => scroll(1)}
        className="absolute right-2 top-[var(--carousel-image-center,50%)] z-20 hidden min-h-11 min-w-11 -translate-y-1/2 rounded-full border border-cocoa/30 bg-cream/95 text-cocoa shadow-sm disabled:opacity-40 sm:block">&#8594;</button>
    </div>
  </section>;
}
