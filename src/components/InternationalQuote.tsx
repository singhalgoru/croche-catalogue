import { lazy, Suspense, useState } from 'react';
import type { Product } from '../types/product';
import internationalQuote from '../content/internationalQuote.json';
import storeContent from '../content/storeContent.json';
import { buildInternationalQuote, type InternationalQuoteDetails, type InternationalQuoteItem } from '../utils/internationalQuote';
import { trackContactClick, trackEvent } from '../services/analytics';

const ProductModal = lazy(() => import('./ProductModal'));

const fields: { key: keyof InternationalQuoteDetails; label: string; type: string; required?: boolean; autoComplete?: string; maxLength: number }[] = [
  { key: 'name', label: 'Your name', type: 'text', required: true, autoComplete: 'name', maxLength: 80 },
  { key: 'email', label: 'Reply email', type: 'email', required: true, autoComplete: 'email', maxLength: 254 },
  { key: 'phone', label: 'Phone / WhatsApp with country code (optional)', type: 'tel', autoComplete: 'tel', maxLength: 40 },
  { key: 'country', label: 'Country', type: 'text', required: true, autoComplete: 'country-name', maxLength: 100 },
  { key: 'city', label: 'City', type: 'text', required: true, autoComplete: 'address-level2', maxLength: 100 },
  { key: 'state', label: 'State / province / region (if applicable)', type: 'text', autoComplete: 'address-level1', maxLength: 100 },
  { key: 'postalCode', label: 'ZIP / postal code', type: 'text', required: true, autoComplete: 'postal-code', maxLength: 32 },
  { key: 'address', label: 'Street address (optional)', type: 'text', autoComplete: 'street-address', maxLength: 200 },
];
const inputClass = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-cocoa/30 bg-white p-2 font-normal';

export default function InternationalQuote({ products, isLoading, loadError, onRefresh }: {
  products: Product[]; isLoading: boolean; loadError: string | null; onRefresh?: () => Promise<void>;
}) {
  const [details, setDetails] = useState<InternationalQuoteDetails>({
    name: '', email: '', phone: '', country: '', city: '', state: '', postalCode: '', address: '', notes: '',
  });
  const [items, setItems] = useState<InternationalQuoteItem[]>(() => [{
    productId: new URLSearchParams(window.location.search).get('product') ?? '', quantity: '1',
  }]);
  const [draft, setDraft] = useState<ReturnType<typeof buildInternationalQuote> | null>(null);
  const [error, setError] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [quickLookProductId, setQuickLookProductId] = useState<string | null>(null);
  const clearDraft = () => { setDraft(null); setError(''); };
  const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name));
  const search = productSearch.trim().toLocaleLowerCase();
  const quickLookProduct = products.find(product => product.id === quickLookProductId);
  return <section className="mx-auto w-full max-w-4xl space-y-5" aria-label="International order enquiry">
    <header className="rounded-3xl bg-cocoa p-5 text-cream sm:p-7">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-mustard">International orders · Request a quote</p>
      <p className="mt-3 max-w-3xl leading-relaxed">{internationalQuote.description}</p>
      <ol aria-label="Quote request steps" className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
        {['Choose products and quantities', 'Share your destination', 'Review and send your request'].map((step, index) =>
          <li key={step} className="flex items-center gap-2 rounded-xl border border-cream/20 bg-white/5 p-3">
            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mustard font-bold text-cocoa">{index + 1}</span>
            {step}
          </li>)}
      </ol>
      <p className="mt-4 text-sm text-cream/80">{internationalQuote.notice}</p>
    </header>
    <form aria-label="International quote request" className="space-y-6 rounded-3xl border border-mustard/40 bg-white p-4 sm:p-7"
      onSubmit={event => {
        event.preventDefault();
        setDraft(null);
        if (isLoading || loadError) { setError('Please wait for the catalogue to load successfully before preparing your request.'); return; }
        try {
          setDraft(buildInternationalQuote(details, items, products));
          trackEvent('quote_request_prepared', { item_count: items.length });
          setError('');
        } catch (cause) {
          if (!(cause instanceof Error)) throw cause;
          setError(cause.message);
        }
      }}>
      <section aria-labelledby="international-products-heading">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mustard/25 font-bold">1</span>
          <div>
            <h2 id="international-products-heading" className="font-heading text-xl font-bold">Choose your products</h2>
            <p className="mt-1 text-sm text-cocoa/75">Choose one or more products and quantities. Only published catalogue products are listed; colours and customisation can be added in your notes.</p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-cream/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">Product catalogue</p>
            {onRefresh && <button type="button" disabled={isLoading}
              onClick={() => { void onRefresh(); }}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold disabled:opacity-50">
              {isLoading ? 'Refreshing products…' : 'Refresh product list'}
            </button>}
          </div>
          {isLoading ? <p role="status" className="mt-2 text-sm">Checking for the latest published products…</p>
            : loadError ? <p role="alert" className="mt-2 text-sm text-red-700">We couldn’t refresh the catalogue. Please try again or contact <a href={`mailto:${internationalQuote.email}`} className="underline">{internationalQuote.email}</a>.</p>
              : products.length ? <p role="status" className="mt-2 text-sm text-cocoa/70">
                {products.length} published {products.length === 1 ? 'product' : 'products'} available. Just published a product? Refresh this list.
              </p>
                : <p role="status" className="mt-2 text-sm">No products are currently available. Please contact <a href={`mailto:${internationalQuote.email}`} className="underline">{internationalQuote.email}</a>.</p>}
          <label className="mt-3 block text-sm font-semibold">Find a product
            <input type="search" value={productSearch} onChange={event => setProductSearch(event.target.value)}
              placeholder="Search by product or collection" className={inputClass} />
          </label>
          {search && !sortedProducts.some(product => `${product.name} ${product.category}`.toLocaleLowerCase().includes(search)) &&
            <p role="status" className="mt-2 text-sm">No products match “{productSearch.trim()}”. Try another search.</p>}
        </div>
      </section>
      <div className="space-y-4">
        {items.map((item, index) => {
          const matchingProducts = sortedProducts.filter(product => product.id === item.productId ||
            `${product.name} ${product.category}`.toLocaleLowerCase().includes(search));
          const categories = [...new Set(matchingProducts.map(product => product.category))].sort((a, b) => a.localeCompare(b));
          const selectedProduct = products.find(product => product.id === item.productId);
          return <fieldset key={index} className="min-w-0 rounded-xl border border-mustard/40 p-3">
            <legend className="px-1 text-sm font-semibold">Product selection {index + 1}</legend>
            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
              <div className="min-w-0">
                <label className="min-w-0 text-sm font-semibold">Product {index + 1}
                  <select required value={item.productId} disabled={isLoading || Boolean(loadError) || !products.length}
                    onChange={event => {
                      const product = products.find(candidate => candidate.id === event.target.value);
                      setItems(current => current.map((entry, row) => row === index ? {
                        productId: event.target.value, quantity: String(product?.minimumOrderQuantity ?? 1),
                      } : entry));
                      clearDraft();
                    }} className={inputClass}>
                    <option value="">Select a product</option>
                    {categories.map(category => <optgroup key={category} label={category}>
                      {matchingProducts.filter(product => product.category === category).map(product =>
                        <option key={product.id} value={product.id}
                          disabled={items.some((entry, row) => row !== index && entry.productId === product.id)}>{product.name}</option>)}
                    </optgroup>)}
                  </select>
                </label>
                {selectedProduct && <button type="button"
                  aria-label={`Quick look at ${selectedProduct.name}`}
                  onClick={() => setQuickLookProductId(item.productId)}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-cocoa underline underline-offset-4">
                  Quick look
                </button>}
              </div>
              <label className="text-sm font-semibold">Quantity {index + 1}
                <input type="number" required min={products.find(product => product.id === item.productId)?.minimumOrderQuantity ?? 1} step={1}
                  value={item.quantity} onChange={event => {
                    setItems(current => current.map((entry, row) => row === index ? { ...entry, quantity: event.target.value } : entry));
                    clearDraft();
                  }} className={inputClass} />
              </label>
              {items.length > 1 && <button type="button" aria-label={`Remove item ${index + 1}`}
                onClick={() => { setItems(current => current.filter((_, row) => row !== index)); clearDraft(); }}
                className="min-h-11 self-end rounded-full border border-cocoa/30 px-3 py-2 text-sm">Remove</button>}
            </div>
          </fieldset>;
        })}
      </div>
      <button type="button" disabled={isLoading || Boolean(loadError) || !products.length || items.length >= products.length}
        onClick={() => { setItems(current => [...current, { productId: '', quantity: '1' }]); clearDraft(); }}
        className="mt-3 min-h-11 rounded-full border border-cocoa px-4 py-2 font-semibold disabled:opacity-50">Add another product</button>
      <section aria-labelledby="international-destination-heading" className="border-t border-cocoa/10 pt-5">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mustard/25 font-bold">2</span>
          <div>
            <h2 id="international-destination-heading" className="font-heading text-xl font-bold">Where should we send it?</h2>
            <p className="mt-1 text-sm text-cocoa/75">Your name, email, country, city and postal code are required. If your destination has no postal code, enter N/A; state or province is needed only where applicable.</p>
          </div>
        </div>
        <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
        {fields.map(field => <label key={field.key} className="min-w-0 text-sm font-semibold">{field.label}
          {field.required && <span aria-hidden="true" className="ml-1 font-normal text-cocoa/60">(required)</span>}
          <input type={field.type} required={field.required} autoComplete={field.autoComplete} maxLength={field.maxLength}
            value={details[field.key]} onChange={event => {
              setDetails(current => ({ ...current, [field.key]: event.target.value })); clearDraft();
            }} className={inputClass} />
        </label>)}
        <label className="min-w-0 text-sm font-semibold sm:col-span-2">Colours, customisation, delivery date or other notes (optional)
          <textarea rows={3} maxLength={500} value={details.notes} onChange={event => {
            setDetails(current => ({ ...current, notes: event.target.value })); clearDraft();
          }} className={inputClass} />
        </label>
        </div>
      </section>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="border-t border-cocoa/10 pt-5">
        <button disabled={isLoading || Boolean(loadError) || !products.length}
          className="min-h-11 w-full rounded-full bg-cocoa px-5 py-3 font-semibold text-cream hover:bg-cocoa/90 disabled:opacity-50 sm:w-auto">Prepare quote request</button>
        <p className="mt-2 text-xs text-cocoa/70">You’ll review the message and choose email or WhatsApp next. This step does not place an order or take payment.</p>
      </div>
      {draft && <section aria-label="Your quote request" className="mt-4 rounded-xl border border-mustard/40 bg-cream/60 p-4">
        <p role="status" className="text-sm font-semibold">Your request is ready. Choose email or WhatsApp, then review and send it there.</p>
        <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm">{draft.body}</pre>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href={draft.emailHref} onClick={() => trackContactClick('email', 'international_quote')}
            className="inline-flex min-h-11 items-center rounded-full bg-cocoa px-5 py-3 font-semibold text-cream">Send via email</a>
          <a href={draft.whatsappHref} target="_blank" rel="noopener noreferrer" onClick={() => trackContactClick('whatsapp', 'international_quote')}
            className="inline-flex min-h-11 items-center rounded-full border border-cocoa px-5 py-3 font-semibold">Send via WhatsApp</a>
        </div>
        <p className="mt-3 text-xs">No email app configured? Copy this request and email {internationalQuote.email}. Your details are shared with your chosen email or WhatsApp service only when you open its draft.</p>
      </section>}
    </form>
    <details className="rounded-2xl border border-mustard/40 bg-white p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">Shipping, customs and quote terms</summary>
      <div className="space-y-3 text-sm"><p>{storeContent.international.details}</p><p>{storeContent.international.customs}</p><p>{storeContent.international.returns}</p>
        <a href="/terms-and-conditions/" className="inline-flex min-h-11 items-center underline">Terms and conditions</a></div>
    </details>
    {quickLookProduct && <Suspense fallback={<p role="status">Loading product preview…</p>}>
      <ProductModal key={quickLookProduct.id} product={quickLookProduct} currentIndex={0} totalProducts={1}
        onClose={() => setQuickLookProductId(null)} onPrevious={() => {}} onNext={() => {}} />
    </Suspense>}
  </section>;
}
