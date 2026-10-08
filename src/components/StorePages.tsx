import { useEffect, useMemo, useState } from 'react';
import ProductCard from './ProductCard';
import Header from './Header';
import Footer from './Footer';
import CollectionGrid from './CollectionGrid';
import storeContent from '../content/storeContent.json';
import { collectionPath } from '../utils/collectionLink.js';
import { toProductPageUrl } from '../utils/productLink';
import { compareCatalogueProducts } from '../utils/catalogueSort';
import { formatWhatsAppNumber, getGeneralWhatsAppLink } from '../utils/whatsapp';
import type { CategorySettings, Product, ProductVariant } from '../types/product';

interface Props {
  products: Product[];
  categorySettings: CategorySettings[];
  isLoading: boolean;
  loadError: string | null;
  hasCatalogueSnapshot: boolean;
  onAddToCart: (product: Product, variant: ProductVariant) => Promise<boolean>;
  isCartBusy: boolean;
  getCartQuantity: (productId: string) => number;
  cartItemCount: number;
  cartUpdateCount: number;
  onOpenCart: () => void;
}

export default function StorePages({
  products, categorySettings, isLoading, loadError, hasCatalogueSnapshot,
  onAddToCart, isCartBusy, getCartQuantity, cartItemCount, cartUpdateCount, onOpenCart,
}: Props) {
  const [catalogueTime, setCatalogueTime] = useState(Date.now);
  const pathname = window.location.pathname;
  const incomingCollection = new URLSearchParams(window.location.search).get('collectionPage');
  const requestedPath = incomingCollection ? `/collections/${encodeURIComponent(incomingCollection)}/` : pathname.replace(/\/?$/, '/');
  const isCollection = requestedPath.startsWith('/collections/') && requestedPath !== '/collections/';
  const isCollectionsHub = requestedPath === '/collections/';
  const showCatalogue = hasCatalogueSnapshot || (!isLoading && !loadError);
  const categories = useMemo(() => [...categorySettings].sort((a, b) => a.priority - b.priority), [categorySettings]);
  const visibleCategories = useMemo(() => {
    const populatedCategories = new Set(products.map(product => product.category));
    return categories.filter(item => populatedCategories.has(item.name));
  }, [categories, products]);
  const category = categories.find(item => collectionPath(item.name) === requestedPath)?.name;
  const collectionProducts = useMemo(() => products.filter(product => product.category === category)
    .sort((a, b) => compareCatalogueProducts(a, b, { now: catalogueTime, categoryRanks: new Map() })), [category, products, catalogueTime]);
  const descriptions: Record<string, string> = storeContent.collectionDescriptions;
  const description = category ? Object.hasOwn(descriptions, category) ? descriptions[category]
    : `Explore ${category} from Luvia Creations. View handmade product designs and confirm details and availability before ordering.` : '';
  const title = pathname.startsWith('/about') ? 'About Luvia & contact'
    : pathname.startsWith('/faq') ? 'Ordering, delivery & care FAQ'
      : isCollection ? category ? `Handmade ${category}` : 'Collection unavailable'
        : 'Explore our handmade collections';

  useEffect(() => {
    const timer = window.setInterval(() => setCatalogueTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isLoading && !hasCatalogueSnapshot) return;
    document.title = `${title} | Luvia Creations`;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = `${window.location.origin}${requestedPath}`;
    if (isCollection) {
      const summary = description || 'This collection is no longer available. Explore the current Luvia collections.';
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]')) meta.content = summary;
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[property="og:title"], meta[name="twitter:title"]')) meta.content = document.title;
      const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]') ?? document.createElement('meta');
      robots.name = 'robots';
      robots.content = category && collectionProducts.length > 0 ? 'index,follow' : 'noindex,follow';
      if (!robots.isConnected) document.head.append(robots);
    }
    const schema = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    if (schema && requestedPath.startsWith('/collections/')) {
      const listed = isCollection ? collectionProducts.map(product => ({
        name: product.name, url: toProductPageUrl(product),
      })) : visibleCategories.map(item => ({ name: item.name, url: `${window.location.origin}${collectionPath(item.name)}` }));
      schema.textContent = JSON.stringify({
        '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: `${window.location.origin}${requestedPath}`,
        mainEntity: { '@type': 'ItemList', numberOfItems: listed.length, itemListElement: listed.map((item, index) => ({
          '@type': 'ListItem', position: index + 1, ...item,
        })) },
      });
    }
    if (incomingCollection && category) window.history.replaceState(null, '', collectionPath(category));
  }, [visibleCategories, category, collectionProducts, description, hasCatalogueSnapshot, incomingCollection, isCollection, isLoading, requestedPath, title]);

  const categoryLinks = (
    <nav aria-label="Explore collections" className="flex flex-wrap gap-3">
      {visibleCategories.map(item => <a key={item.name} href={collectionPath(item.name)}
        className="rounded-full border border-mustard px-4 py-2 text-sm underline underline-offset-4">{item.name}</a>)}
    </nav>
  );
  return <div className="flex min-h-screen flex-col">
    <Header compact alignLogoLeft showHeading={false} showInstallPrompt={false} categories={showCatalogue ? visibleCategories.map(item => item.name) : []} collectionPages
      cartItemCount={cartItemCount} cartUpdateCount={cartUpdateCount} onOpenCart={onOpenCart} />
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-6 text-cocoa">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-3 text-sm"><a href="/" className="underline">Home</a>
        {isCollection && <a href="/collections/" className="underline">Collections</a>}<span aria-current="page">{title}</span></nav>
      <h1 className="font-heading text-3xl font-bold">{title}</h1>
      {loadError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">Unable to refresh the catalogue: {loadError}.
        {hasCatalogueSnapshot ? ' Showing the last available catalogue. Retrying automatically.' : ' Retrying automatically when connected.'}</p>}
      {isLoading && <p role="status">Checking the latest collections and availability…</p>}
      {pathname.startsWith('/about') ? <section className="max-w-3xl space-y-4">
        <h2 className="font-heading text-xl font-bold">Thoughtfully crafted crochet, made to be treasured</h2>
        <p>{storeContent.about[0]}</p><p>{storeContent.about[1]}</p>
        <h2 className="font-heading text-xl font-bold">Personal touches, confirmed with you</h2><p>{storeContent.about[2]}</p>
        <h2 className="font-heading text-xl font-bold">Contact Luvia</h2>
        <a href={getGeneralWhatsAppLink()} className="inline-block rounded-full bg-cocoa px-5 py-3 font-semibold text-cream">Ask us on WhatsApp</a>
        <p>WhatsApp / mobile: <a href={getGeneralWhatsAppLink()} className="underline">{formatWhatsAppNumber()}</a></p>
        <p>Orders: <a href="mailto:orders@luviacreations.com" className="underline">orders@luviacreations.com</a></p>
        <p>General enquiries: <a href="mailto:hello@luviacreations.com" className="underline">hello@luviacreations.com</a></p>
        <a href="https://www.instagram.com/luvia.craftedwithlove/" className="inline-block underline">Follow Luvia on Instagram</a>
        <h2 className="font-heading text-xl font-bold">Ordering across India</h2><p>{storeContent.about[3]}</p>
        <h2 className="font-heading text-xl font-bold">{storeContent.orderingDisclosure.title}</h2>
        <p>{storeContent.orderingDisclosure.request}</p>
        <p>{storeContent.orderingDisclosure.price}</p>
        <p>{storeContent.orderingDisclosure.payment}</p>
        <a href="/faq/" className="inline-block underline">Read the ordering FAQ</a>
        <a href="/return-policy/" className="ml-4 inline-block underline">Return and refund policy</a>
      </section> : pathname.startsWith('/faq') ? <section className="max-w-3xl space-y-3">
        <p>Answers about ordering, custom colours, shipping across India, care and returns.</p>
        {storeContent.questions.map(([question, answer]) => <details key={question} className="rounded-xl border border-mustard/40 bg-white p-4">
          <summary className="cursor-pointer font-semibold">{question}</summary><p className="mt-3">{answer}</p>
        </details>)}
        <details className="rounded-xl border border-mustard/40 bg-white p-4"><summary className="cursor-pointer font-semibold">What is the return and refund policy?</summary>
          <p className="mt-3">Read our <a href="/return-policy/" className="underline">return and refund policy</a> before ordering. Contact us if you need clarification about your order.</p></details>
      </section> : isCollection ? <>
        {showCatalogue && !category ? <p role="alert">This collection is no longer available. Explore the current collections below.</p> : <>
          <p className="max-w-3xl">{description}</p>
          {category && <a href={`/?category=${encodeURIComponent(category)}`} className="inline-block rounded-full bg-cocoa px-5 py-3 font-semibold text-cream">Shop {category} with the cart</a>}
          {showCatalogue && collectionProducts.length === 0 && <p>No published products in this collection yet.</p>}
          {showCatalogue && <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {collectionProducts.map((product, index) => <li key={product.id}>
              <ProductCard product={product} isFirstProduct={index === 0}
                onSelect={selected => window.location.assign(toProductPageUrl(selected))}
                onAddToCart={onAddToCart} isCartBusy={isCartBusy || isLoading || Boolean(loadError)}
                cartQuantity={getCartQuantity(product.id)} />
            </li>)}
          </ul>}
        </>}
      </> : <><p>Find your favourites by collection, then open a product for photos and details.</p>
        <a href="/" className="inline-block rounded-full bg-cocoa px-5 py-3 font-semibold text-cream">Shop all products</a>
        {showCatalogue && <CollectionGrid categories={visibleCategories} products={products} />}
        {showCatalogue && visibleCategories.length === 0 && <p>No collections are available yet.</p>}</>}
      {showCatalogue && !isCollectionsHub && <section className="space-y-3"><h2 className="font-heading text-xl font-bold">Explore collections</h2>{categoryLinks}</section>}
      <p className="text-sm">Confirm the final price, shipping charges and dispatch estimate with us before paying.</p>
    </main><Footer />
  </div>;
}
