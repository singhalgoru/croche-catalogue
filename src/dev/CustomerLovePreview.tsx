import { useEffect, useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import CustomerLove from '../components/CustomerLove';
import CustomerLoveManager from '../components/admin/CustomerLoveManager';
import AdminWorkspace from '../components/admin/AdminWorkspace';
import ProductCarousel from '../components/ProductCarousel';
import { newTestimonial, validateTestimonial, type AdminTestimonial, type CustomerLoveRepository } from '../services/customerLove';
import type { Product } from '../types/product';

const key = 'luvia-customer-love-demo-v1';
const products: Product[] = [
  { id: '00000000-0000-4000-8000-000000000001', publicSlug: 'demo-scrunchie', name: 'Crochet Scrunchie', category: 'Hair Accessories',
    description: 'A colourful handmade finishing touch.', price: 150, color: 'Pink', image: '/images/processed/scrunchie-mustard-pink.jpg', inStock: true, variants: [] },
  { id: '00000000-0000-4000-8000-000000000002', publicSlug: 'demo-paw-charm', name: 'Paw Bag Charm', category: 'Bag Charms',
    description: 'A little handmade keepsake for your favourite bag.', price: 200, color: 'Brown', image: '/images/Collages/pawprint-charm-collage.jpg', inStock: true, variants: [] },
  { id: '00000000-0000-4000-8000-000000000003', publicSlug: 'demo-sunflower', name: 'Sunflower Brooch', category: 'Accessories',
    description: 'Carry a little sunshine with you.', price: 150, color: 'Yellow', image: '/images/processed/sunflower-brooch-1.jpg', inStock: true, variants: [] },
];
const initial: AdminTestimonial[] = [
  { ...newTestimonial(), id: '10000000-0000-4000-8000-000000000001', display_name: 'Demo customer A',
    quote: 'A beautiful handmade finishing touch. The colours make me smile every time I wear it.',
    product_id: products[0].id, has_image: true, image_alt: 'Demo product photo of a colourful crochet scrunchie', featured: true,
    published: true, consent_confirmed: true, consent_date: '2026-11-01', consent_source: 'Synthetic preview only - not customer permission', version: 1 },
  { ...newTestimonial(), id: '10000000-0000-4000-8000-000000000002', display_name: 'Demo customer B',
    quote: 'Such a thoughtful little keepsake. It adds a special handmade touch to my everyday bag.',
    product_id: products[1].id, has_image: true, image_alt: 'Demo product photo of handmade paw charms', featured: true, sort_order: 1,
    published: true, consent_confirmed: true, consent_date: '2026-11-01', consent_source: 'Synthetic preview only - not customer permission', version: 1 },
  { ...newTestimonial(), id: '10000000-0000-4000-8000-000000000003', display_name: 'Demo customer C',
    quote: 'A tiny piece of sunshine! You can really see the care that goes into every stitch.',
    product_id: products[2].id, has_image: true, image_alt: 'Demo product photo of a sunflower brooch', featured: true, sort_order: 2,
    published: true, consent_confirmed: true, consent_date: '2026-11-01', consent_source: 'Synthetic preview only - not customer permission', version: 1 },
  { ...newTestimonial(), id: '10000000-0000-4000-8000-000000000004', display_name: 'Demo draft',
    quote: 'This story is waiting for customer permission and is only visible in the admin preview.', version: 1, sort_order: 3 },
];
interface DemoState { entries: AdminTestimonial[]; photos: Record<string, string> }
function readDemo(): DemoState {
  const saved = localStorage.getItem(key);
  if (saved) return JSON.parse(saved);
  return { entries: initial, photos: Object.fromEntries(initial.slice(0, 3).map((entry, index) => [entry.id, products[index].image])) };
}
export default function CustomerLovePreview() {
  const [state, setState] = useState<DemoState>(readDemo);
  const [storageError, setStorageError] = useState('');
  const [view, setView] = useState(new URLSearchParams(location.search).get('view') ?? 'admin');
  useEffect(() => {
    document.title = `${view === 'admin' ? 'Admin' : 'Website'} Customer Love preview | Luvia Creations`;
  }, [view]);
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key !== key) return;
      try { setState(readDemo()); setStorageError(''); }
      catch (error) { setStorageError(error instanceof Error ? error.message : 'Unable to refresh the local preview.'); }
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);
  const [repository] = useState<CustomerLoveRepository>(() => {
    const write = (next: DemoState) => {
      localStorage.setItem(key, JSON.stringify(next)); setState(next);
    };
    return {
      async list() { return readDemo().entries; },
      async photo(id) { return readDemo().photos[id] ?? null; },
      async save(entry, photo) {
        validateTestimonial(entry);
        const current = readDemo();
        const previous = current.entries.find(item => item.id === entry.id);
        if ((previous?.version ?? 0) !== entry.version) throw new Error('Demo record changed. Reload before saving.');
        const saved = { ...entry, version: entry.version + 1 };
        const photos = { ...current.photos };
        if (photo === '') delete photos[entry.id];
        else if (photo) photos[entry.id] = `data:image/webp;base64,${photo}`;
        write({ entries: previous ? current.entries.map(item => item.id === entry.id ? saved : item) : [...current.entries, saved], photos });
      },
      async remove(entry) {
        const current = readDemo();
        if (current.entries.find(item => item.id === entry.id)?.version !== entry.version) throw new Error('Demo record changed. Reload before deleting.');
        const photos = { ...current.photos }; delete photos[entry.id];
        write({ entries: current.entries.filter(item => item.id !== entry.id), photos });
      },
    };
  });
  const visible = state.entries.filter(entry => entry.published && entry.consent_confirmed);
  const navigate = (next: string) => { setView(next); history.replaceState(null, '', `?view=${next}`); };
  return <div className="min-h-screen bg-cream text-cocoa">
    <div className="border-b border-mustard bg-mustard/20 p-4 text-center text-sm">
      <strong>LOCAL DEMO ONLY</strong> - Fictional quotes and existing product photos. No real customer information or production changes.
      <nav aria-label="Preview views" className="mt-2 flex flex-wrap justify-center gap-4">
        {['admin', 'shop', 'stories', 'product'].map(next => <button key={next} aria-pressed={view === next}
          className="min-h-11 rounded-full border border-cocoa/30 px-4 font-semibold" onClick={() => navigate(next)}>
          {({ admin: 'Admin preview', shop: 'Website preview', stories: 'All customer stories', product: 'Product page preview' })[next]}
        </button>)}
      </nav>
    </div>
    <Header showInstallPrompt={false} showHeading={view === 'shop'} compact={view !== 'shop'} />
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      {storageError && <p role="alert">{storageError}</p>}
      {view === 'admin' ? <>
        <h1 className="font-heading text-3xl font-bold">Luvia Admin</h1>
        <AdminWorkspace initialSection="Customer Love">{{
          Products: <p>Product management is not connected in this isolated demo.</p>,
          Orders: <p>Orders are not connected in this isolated demo.</p>, Customers: <p>Customer accounts are not connected in this demo.</p>,
          'Customer Love': <CustomerLoveManager repository={repository} products={products} />,
          Artisans: <p>Artisans are not connected in this isolated demo.</p>, Sales: <p>Sales are not connected in this demo.</p>,
          Snapshots: <p>Snapshots are not connected in this demo.</p>, Settings: <p>Settings are not connected in this demo.</p>,
        }}</AdminWorkspace>
      </> : <>
        {view === 'shop' && <><ProductCarousel products={products} title="Bestsellers" label="bestselling product" viewAll="/bestsellers/"
          onSelect={() => navigate('product')} description="Demo catalogue favourites." />
          <ProductCarousel products={products} title="Featured products" label="featured product" viewAll="/featured/"
            onSelect={() => navigate('product')} description="Handpicked handmade favourites." /></>}
        {view === 'stories' && <><h1 className="font-heading text-3xl font-bold">Customer Love</h1>
          <p>Little moments of joy, shared by our customers with permission. These are selected customer stories, not star ratings.</p></>}
        {view === 'product' && <div className="grid items-center gap-6 sm:grid-cols-2">
          <img src={products[0].image} alt={products[0].name} className="aspect-square w-full rounded-2xl object-contain" />
          <div><h1 className="font-heading text-3xl font-bold">{products[0].name}</h1><p>{products[0].description}</p></div>
        </div>}
        <CustomerLove products={products} entries={visible} page={view === 'stories'} productId={view === 'product' ? products[0].id : undefined}
          imageUrl={entry => state.photos[entry.id]} />
      </>}
    </main>
    {view !== 'admin' && <Footer showCollaboration={false} showBulkOrders={false} />}
  </div>;
}
