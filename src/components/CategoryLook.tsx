import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CategorySettings, Product } from '../types/product';
import { formatINR } from '../utils/currency';
import { getProductImageUrl } from '../utils/productImageUrl';
import { toProductPageUrl } from '../utils/productLink';
import ProductDiscount from './ProductDiscount';
import { getCategoryHotspots } from '../utils/categoryImage.js';
import { productImageProtection } from '../utils/imageProtection';
import { trackShopTheLookHotspot, trackShopTheLookProductOpened, trackShopTheLookViewed } from '../services/analytics';

export default function CategoryLook({ category, products }: { category: CategorySettings; products: Product[] }) {
  const [active, setActive] = useState<string | null>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const [imageFailed, setImageFailed] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const spots = getCategoryHotspots(products, category);
  const hasLook = Boolean(category.coverImage && spots.length);
  const spotProductKey = spots.map(spot => spot.productId).join(',');
  const latestSpots = useRef(spots);
  useEffect(() => { latestSpots.current = spots; });
  const selectedIndex = spots.findIndex(spot => spot.productId === active);
  const selected = spots[selectedIndex];
  const selectedX = selected?.x;
  const selectedY = selected?.y;

  useEffect(() => {
    if (active === null) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !sceneRef.current?.contains(event.target)) setActive(null);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [active]);

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    const card = cardRef.current;
    if (!scene || !card || selectedX === undefined || selectedY === undefined || imageFailed) return;
    const measure = () => {
      const width = scene.clientWidth;
      const height = scene.clientHeight;
      const x = width * selectedX / 100;
      const y = height * selectedY / 100;
      const below = y + 24;
      const top = below + card.offsetHeight <= height - 8 ? below : y - card.offsetHeight - 24;
      setPosition({
        left: Math.max(8, Math.min(x - card.offsetWidth / 2, width - card.offsetWidth - 8)),
        top: Math.max(8, Math.min(top, height - card.offsetHeight - 8)),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scene);
    observer.observe(card);
    return () => observer.disconnect();
  }, [active, selectedX, selectedY, imageFailed]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!hasLook || !section) return;
    const report = () => trackShopTheLookViewed(category.name, latestSpots.current.map(spot => spot.product));
    if (!('IntersectionObserver' in window)) { report(); return; }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      report();
    }, { threshold: 0.5 });
    observer.observe(section);
    return () => observer.disconnect();
  }, [hasLook, category.name, spotProductKey]);

  if (!hasLook || !category.coverImage) return null;

  return <section ref={sectionRef} aria-label={`Shop the look: ${category.name}`} className="category-look max-w-3xl space-y-3 rounded-2xl border border-mustard/40 bg-white p-3 sm:p-5">
    <h2 className="font-heading text-xl font-bold">Shop this look</h2>
    <p className="text-sm text-cocoa/70">Tap a small ring to explore the products used in this image</p>
    {imageFailed ? <p role="alert">This collection photo could not load. You can still explore its linked products below.</p> :
      <div ref={sceneRef} className="relative"
        onClick={event => {
          if (!(event.target instanceof Element) || !event.target.closest('button, a')) setActive(null);
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setActive(null);
            triggerRef.current?.focus();
          }
        }}>
        <img src={getProductImageUrl(category.coverImage, 1080)} alt={`${category.name} styled collection`}
          onError={() => setImageFailed(true)} className="block h-auto w-full rounded-xl" {...productImageProtection} />
        {spots.map((spot, index) => <button key={`${spot.productId}-${index}`} type="button"
          aria-label={`Explore ${spot.product.name}, hotspot ${index + 1}`} aria-pressed={selected === spot}
          aria-expanded={selected === spot}
          onClick={event => { triggerRef.current = event.currentTarget; setActive(spot.productId); trackShopTheLookHotspot(category.name, spot.product, index); }}
          style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
          className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa">
          <span aria-hidden="true" className={`hotspot-ring h-2.5 w-2.5 rounded-full border-white bg-transparent ${
            selected === spot ? 'border-2' : 'border-[1.5px]'
          }`} />
        </button>)}
        {selected && <div ref={cardRef} role="group" aria-label="Selected hotspot product"
          style={{ ...position, width: 'min(240px, calc(100% - 16px))', maxHeight: 'calc(100% - 16px)' }}
          className="absolute z-10 overflow-y-auto rounded-xl border border-mustard/50 bg-cream shadow-lg">
          <button type="button" aria-label="Close product preview" onClick={() => {
            setActive(null); triggerRef.current?.focus();
          }} className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-tr-xl text-xl"
          >&times;</button>
          <a href={toProductPageUrl(selected.product)} aria-label={`View ${selected.product.name}`}
            onClick={() => trackShopTheLookProductOpened(category.name, selected.product, selectedIndex, 'card')}
            className="flex min-h-20 items-center gap-3 rounded-xl p-3 pr-11 focus-visible:outline-2 focus-visible:outline-cocoa">
            <img src={getProductImageUrl(selected.product.image, 160)} alt="" width={48} height={48}
              className="h-12 w-12 shrink-0 rounded-lg object-contain" {...productImageProtection} />
            <div className="min-w-0 space-y-1 text-sm">
              <h3 className="break-words font-semibold">{selected.product.name}</h3>
              {selected.product.showPrice !== false && selected.product.price !== null &&
                <p>{formatINR(selected.product.price)} <ProductDiscount product={selected.product} /></p>}
              {!selected.product.inStock && <p>Out of stock</p>}
              <span className="underline underline-offset-2">View product</span>
            </div>
          </a>
        </div>}
      </div>}
    <p aria-live="polite" className="sr-only">{selected ? `${selected.product.name} selected. Open its product card to view details.` : ''}</p>
    <ol className="sr-only focus-within:not-sr-only" aria-label="Products in this look">
      {spots.map((spot, index) => <li key={`${spot.productId}-${index}`}>
        <a href={toProductPageUrl(spot.product)} onClick={() => trackShopTheLookProductOpened(category.name, spot.product, index, 'list')}
          className="inline-flex min-h-11 items-center underline underline-offset-4">
          {spot.product.name}
        </a>
      </li>)}
    </ol>
  </section>;
}
