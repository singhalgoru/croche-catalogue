import { useState } from 'react';
import type { Product } from '../types/product';
import internationalQuote from '../content/internationalQuote.json';
import storeContent from '../content/storeContent.json';
import { buildInternationalQuote, type InternationalQuoteDetails, type InternationalQuoteItem } from '../utils/internationalQuote';
import { trackContactClick } from '../services/analytics';

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

export default function InternationalQuote({ products, isLoading, loadError }: {
  products: Product[]; isLoading: boolean; loadError: string | null;
}) {
  const [details, setDetails] = useState<InternationalQuoteDetails>({
    name: '', email: '', phone: '', country: '', city: '', state: '', postalCode: '', address: '', notes: '',
  });
  const [items, setItems] = useState<InternationalQuoteItem[]>(() => [{
    productId: new URLSearchParams(window.location.search).get('product') ?? '', quantity: '1',
  }]);
  const [draft, setDraft] = useState<ReturnType<typeof buildInternationalQuote> | null>(null);
  const [error, setError] = useState('');
  const clearDraft = () => { setDraft(null); setError(''); };
  const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name));
  return <section className="max-w-3xl space-y-4" aria-label="International order enquiry">
    <p>{internationalQuote.description}</p>
    <p className="text-sm">{internationalQuote.notice}</p>
    <form aria-label="International quote request" className="rounded-2xl border border-mustard/40 bg-white p-4 sm:p-6"
      onSubmit={event => {
        event.preventDefault();
        setDraft(null);
        if (isLoading || loadError) { setError('Please wait for the catalogue to load successfully before preparing your request.'); return; }
        try {
          setDraft(buildInternationalQuote(details, items, products));
          setError('');
        } catch (cause) {
          if (!(cause instanceof Error)) throw cause;
          setError(cause.message);
        }
      }}>
      <h2 className="font-heading text-xl font-bold">Products and quantities</h2>
      <p className="mt-2 text-sm">Choose one or more products. Colours and customisation can be described in the notes; availability will be confirmed in your quote.</p>
      {!isLoading && !loadError && !products.length && <p role="status" className="mt-3">No products are currently available. Please contact <a href={`mailto:${internationalQuote.email}`} className="underline">{internationalQuote.email}</a>.</p>}
      <div className="mt-4 space-y-4">
        {items.map((item, index) => <fieldset key={index} className="min-w-0 rounded-xl border border-mustard/40 p-3">
          <legend className="px-1 text-sm font-semibold">Item {index + 1}</legend>
          <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
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
                {sortedProducts.map(product => <option key={product.id} value={product.id}
                  disabled={items.some((entry, row) => row !== index && entry.productId === product.id)}>{product.name}</option>)}
              </select>
            </label>
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
        </fieldset>)}
      </div>
      <button type="button" disabled={isLoading || Boolean(loadError) || items.length >= products.length}
        onClick={() => { setItems(current => [...current, { productId: '', quantity: '1' }]); clearDraft(); }}
        className="mt-3 min-h-11 rounded-full border border-cocoa px-4 py-2 font-semibold disabled:opacity-50">Add another product</button>
      <h2 className="mt-6 font-heading text-xl font-bold">Contact and delivery destination</h2>
      <p className="mt-2 text-sm">Required fields are your name, reply email, country, city and postal code. If your destination has no postal code, enter N/A. State / province is needed only where applicable.</p>
      <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
        {fields.map(field => <label key={field.key} className="min-w-0 text-sm font-semibold">{field.label}
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
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <button disabled={isLoading || Boolean(loadError) || !products.length}
        className="mt-4 min-h-11 rounded-full bg-cocoa px-5 py-3 font-semibold text-cream disabled:opacity-50">Prepare quote request</button>
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
    <details className="rounded-xl border border-mustard/40 p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">Shipping, customs and quote terms</summary>
      <div className="space-y-3 text-sm"><p>{storeContent.international.details}</p><p>{storeContent.international.customs}</p><p>{storeContent.international.returns}</p>
        <a href="/terms-and-conditions/" className="inline-flex min-h-11 items-center underline">Terms and conditions</a></div>
    </details>
  </section>;
}
