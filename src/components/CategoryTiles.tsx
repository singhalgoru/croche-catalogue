import { useEffect, useRef, useState } from 'react';
import type { CategorySettings, Product } from '../types/product';
import { matchesCategory } from '../utils/categorySelection';
import { collectionPath } from '../utils/collectionLink.js';
import { getProductCardSrcSet, getProductImageUrl } from '../utils/productImageUrl';
import { productImageProtection } from '../utils/imageProtection';

export default function CategoryTiles({ categories, products, categorySettings = [] }: {
  categories: string[]; products: Product[]; categorySettings?: CategorySettings[];
}) {
  const track = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  const measure = () => {
    const element = track.current;
    if (element) setEdges({ start: element.scrollLeft <= 1,
      end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 1 });
  };
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const card of element.children) observer.observe(card);
    return () => observer.disconnect();
  }, [categories, products, categorySettings]);
  useEffect(() => {
    if (paused || hovered || focused || reducedMotion) return;
    let animation: number | undefined;
    let moving: HTMLElement | null = null;
    const stop = () => {
      if (animation !== undefined) window.cancelAnimationFrame(animation);
      animation = undefined;
      if (moving) moving.style.scrollSnapType = '';
      moving = null;
    };
    const timer = window.setInterval(() => {
      const element = track.current;
      if (!element || document.visibilityState !== 'visible' || element.scrollWidth <= element.clientWidth + 1) return;
      const card = element.querySelector('a');
      if (!card) return;
      const atEnd = element.scrollLeft + element.clientWidth >= element.scrollWidth - 1;
      const step = card.getBoundingClientRect().width + parseFloat(getComputedStyle(element).columnGap || '0');
      stop();
      const start = element.scrollLeft;
      const target = atEnd ? 0 : Math.min(element.scrollWidth - element.clientWidth, start + step);
      const started = performance.now();
      moving = element;
      element.style.scrollSnapType = 'none';
      const glide = (now: number) => {
        if (document.visibilityState !== 'visible') { stop(); return; }
        const progress = Math.min(1, (now - started) / 1000);
        const eased = progress * progress * (3 - 2 * progress);
        element.scrollLeft = start + (target - start) * eased;
        if (progress < 1) animation = window.requestAnimationFrame(glide);
        else stop();
      };
      animation = window.requestAnimationFrame(glide);
    }, 5000);
    return () => { window.clearInterval(timer); stop(); };
  }, [paused, hovered, focused, reducedMotion]);
  const scroll = (direction: number) => {
    const element = track.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth * 0.8,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  const seasonal = new Set(categorySettings.filter(category => category.isSeasonal).map(category => category.name));
  const orderedCategories = [...categories.filter(category => seasonal.has(category)),
    ...categories.filter(category => !seasonal.has(category))];
  return <section aria-labelledby="homepage-collections-heading" className="relative min-w-0 space-y-3"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="flex items-center justify-between gap-3">
      <h2 id="homepage-collections-heading" className="font-heading text-xl font-bold text-cocoa">Explore collections</h2>
      <div className="flex shrink-0 items-center gap-2">
        <a href="/collections/" className="text-sm font-semibold text-cocoa underline underline-offset-4">View all</a>
        <button type="button" aria-label={paused || reducedMotion ? 'Resume collection rotation' : 'Pause collection rotation'}
          disabled={reducedMotion} aria-pressed={paused || reducedMotion} onClick={() => setPaused(current => !current)}
          className="sr-only rounded-full border border-cocoa/30 bg-cream text-sm text-cocoa focus:not-sr-only focus:absolute focus:right-0 focus:top-12 focus:z-10 focus:min-h-11 focus:min-w-11 disabled:opacity-40">
          {paused || reducedMotion ? 'Play' : 'Pause'}
        </button>
      </div>
    </div>
    <div className="relative min-w-0">
    <nav ref={track} id="homepage-collections-carousel" aria-label="Explore collections"
      onScroll={measure} className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2">
    {orderedCategories.map(category => {
      const candidates = products.filter(product => matchesCategory(product, category, categorySettings));
      const product = candidates.find(candidate => candidate.inStock) ?? candidates[0];
      if (!product) return null;
      const settings = categorySettings.find(item => item.name === category);
      const image = (settings?.isSeasonal && settings.coverImage) || (product.variants.find(variant => variant.inStock)?.image ?? product.image);
      return <a key={category} href={collectionPath(category)}
        className="w-[38%] min-w-0 shrink-0 snap-start overflow-hidden rounded-xl border border-mustard/30 bg-white hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cocoa sm:w-[calc((100%-36px)/4)] lg:w-[calc((100%-60px)/6)]">
        <img src={getProductImageUrl(image, 480)} srcSet={getProductCardSrcSet(image)}
          sizes="(min-width: 1024px) 180px, (min-width: 640px) 24vw, 38vw"
          alt="" width={480} height={480} loading="lazy"
          className="aspect-square w-full bg-cream-dark object-contain" {...productImageProtection} />
        <span className={`block break-words p-3 text-center text-sm font-semibold text-cocoa ${categorySettings.find(item => item.name === category)?.isSeasonal ? 'badge-glow bg-mustard/20' : ''}`}>{category}</span>
      </a>;
    })}
    </nav>
    <button type="button" aria-label="Previous collections" aria-controls="homepage-collections-carousel"
      disabled={edges.start} onClick={() => scroll(-1)}
      className="absolute left-2 top-1/2 hidden min-h-11 min-w-11 -translate-y-1/2 rounded-full border border-cocoa/30 bg-cream/95 text-cocoa shadow-sm disabled:opacity-40 sm:block">&#8592;</button>
    <button type="button" aria-label="Next collections" aria-controls="homepage-collections-carousel"
      disabled={edges.end} onClick={() => scroll(1)}
      className="absolute right-2 top-1/2 hidden min-h-11 min-w-11 -translate-y-1/2 rounded-full border border-cocoa/30 bg-cream/95 text-cocoa shadow-sm disabled:opacity-40 sm:block">&#8594;</button>
    </div>
  </section>;
}
