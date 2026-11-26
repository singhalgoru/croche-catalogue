import { Children, cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';

export default function RotatingCarousel({ title, label, children, itemCount, navigation = false, viewAll, description, pinned, className = '', headerAction, headerLayout = 'inline', titleIcon, onView }: {
  title: string; label: string; children: ReactNode; itemCount: number;
  navigation?: boolean; viewAll?: string; description?: ReactNode; pinned?: ReactNode;
  className?: string; headerAction?: ReactNode; titleIcon?: ReactNode; onView?: () => void;
  headerLayout?: 'inline' | 'stacked-mobile';
}) {
  const id = useId();
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLElement>(null);
  const viewTracked = useRef(false);
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
      const first = element.querySelector<HTMLElement>(':scope > a, :scope > div:not([data-pinned])');
      const gap = parseFloat(getComputedStyle(element).columnGap || '0');
      loopWidth.current = first ? (first.getBoundingClientRect().width + gap) * cards.length : 0;
      if (first) element.parentElement?.style.setProperty('--carousel-image-center', `${first.getBoundingClientRect().width / 2}px`);
      const pinnedElement = element.querySelector<HTMLElement>('[data-pinned="true"]');
      if (pinnedElement) {
        element.parentElement?.style.setProperty('--carousel-pinned-width', `${pinnedElement.getBoundingClientRect().width}px`);
      }
      setLooping(cards.length > 1 && loopWidth.current - gap > element.clientWidth - (pinnedElement?.getBoundingClientRect().width ?? 0));
      const bounds = element.getBoundingClientRect();
      const visibleLeft = bounds.left + (pinnedElement?.getBoundingClientRect().width ?? 0);
      const items = [...element.children].filter((child): child is HTMLElement =>
        child instanceof HTMLElement && !child.hasAttribute('data-pinned'));
      for (let index = 0; index < cards.length; index++) {
        const original = items[index];
        if (!original) continue;
        const copy = items[index + cards.length];
        const copyBounds = copy?.getBoundingClientRect();
        const copyVisible = Boolean(copyBounds && copyBounds.left < bounds.right - 1 && copyBounds.right > visibleLeft + 1);
        if (original.inert !== copyVisible) {
          original.inert = copyVisible;
          if (copyVisible) original.setAttribute('aria-hidden', 'true');
          else original.removeAttribute('aria-hidden');
        }
        if (copy && copy.inert === copyVisible) {
          copy.inert = !copyVisible;
          copy.setAttribute('aria-hidden', String(!copyVisible));
          copy.tabIndex = copyVisible ? original.tabIndex : -1;
        }
      }
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
    const element = section.current;
    if (!element || !onView || viewTracked.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        viewTracked.current = true;
        onView();
        observer.disconnect();
      }
    }, { threshold: 0.2 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [onView]);
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
  return <section ref={section} aria-labelledby={`${id}-heading`} className={`relative min-w-0 space-y-3 ${className}`}
    onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }}
    onPointerLeave={event => { if (event.pointerType === 'mouse') setHovered(false); }}
    onTouchStart={() => setTouched(true)} onTouchEnd={() => setTouched(false)} onTouchCancel={() => setTouched(false)}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className={`flex justify-between gap-3 ${headerLayout === 'stacked-mobile' ? 'flex-col items-stretch sm:flex-row sm:items-center' : 'items-center'}`}>
      <div className="min-w-0">
        <h2 id={`${id}-heading`} className="font-heading text-xl font-bold text-cocoa">
          {titleIcon
            ? <span className="inline-flex items-center gap-2">{titleIcon}{title}</span>
            : title}
        </h2>
        {headerLayout === 'stacked-mobile' && description && <div className="mt-1 text-sm text-cocoa/75">{description}</div>}
      </div>
      <div className={`flex items-center gap-3 ${headerLayout === 'stacked-mobile' ? 'justify-between sm:justify-start' : ''}`}>
        {viewAll && <a href={viewAll} className={`text-sm font-semibold text-cocoa underline underline-offset-4 ${headerLayout === 'stacked-mobile' ? 'inline-flex min-h-11 shrink-0 items-center sm:min-h-0' : ''}`}>View all</a>}
        {headerAction}
        <button type="button" aria-label={paused || reducedMotion ? `Resume ${label} rotation` : `Pause ${label} rotation`}
          disabled={reducedMotion} aria-pressed={paused || reducedMotion} onClick={() => setPaused(current => !current)}
          className="sr-only rounded-full border border-cocoa/30 bg-cream text-sm text-cocoa focus:not-sr-only focus:absolute focus:right-0 focus:top-12 focus:z-10 focus:min-h-11 focus:min-w-11 disabled:opacity-40">
          {paused || reducedMotion ? 'Play' : 'Pause'}
        </button>
      </div>
    </div>
    {headerLayout === 'inline' && description && <div className="text-sm text-cocoa/75">{description}</div>}
    <div className="relative min-w-0">
      <Track ref={element => { track.current = element; }} id={`${id}-track`} aria-label={title} role={navigation ? undefined : 'group'}
        onScroll={measure} className="no-scrollbar flex gap-3 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pinned && (
          <div data-pinned="true" className="sticky left-0 z-10 flex shrink-0 bg-cream w-[38%] sm:w-[calc((100%-36px)/4)] lg:w-[calc((100%-60px)/6)]">
            {pinned}
          </div>
        )}
        {cards}
        {looping && cards.map(card => isValidElement<HTMLAttributes<HTMLElement>>(card)
          ? cloneElement(card, { key: `loop-${card.key}`, 'aria-hidden': true, tabIndex: -1, inert: true }) : null)}
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
