import { useState } from 'react';
import bulkOrders from '../content/bulkOrders.json';
import { trackContactClick } from '../services/analytics';
import { getBulkOrderWhatsAppLink } from '../utils/whatsapp';
import { WhatsAppIcon } from './SocialIcons';
import { buildBulkOrderEmail, type BulkOrderEnquiry } from '../utils/bulkOrders';

const fields: { key: keyof BulkOrderEnquiry; label: string; type: string; required: boolean; maxLength: number }[] = [
  { key: 'name', label: 'Your name', type: 'text', required: true, maxLength: 80 },
  { key: 'company', label: 'Company / organisation (optional)', type: 'text', required: false, maxLength: 120 },
  { key: 'email', label: 'Reply email', type: 'email', required: true, maxLength: 254 },
  { key: 'occasion', label: 'Occasion / event (optional)', type: 'text', required: false, maxLength: 120 },
  { key: 'products', label: 'Products or gifting ideas', type: 'text', required: true, maxLength: 200 },
  { key: 'quantity', label: 'Approximate quantity', type: 'number', required: true, maxLength: 10 },
  { key: 'budget', label: 'Budget per gift in INR (optional)', type: 'number', required: false, maxLength: 10 },
  { key: 'city', label: 'Delivery city / pincode', type: 'text', required: true, maxLength: 120 },
  { key: 'date', label: 'Required delivery date (optional)', type: 'date', required: false, maxLength: 10 },
];

export default function BulkOrders({ presentation = 'section' }: { presentation?: 'section' | 'page' }) {
  const isPage = presentation === 'page';
  const [formOpen, setFormOpen] = useState(isPage);
  const [enquiry, setEnquiry] = useState<BulkOrderEnquiry>({
    name: '', company: '', email: '', occasion: '', products: '', quantity: '', budget: '', city: '', date: '', preferences: '',
  });
  const [draft, setDraft] = useState<ReturnType<typeof buildBulkOrderEmail> | null>(null);
  const [error, setError] = useState('');
  const change = (key: keyof BulkOrderEnquiry, value: string) => {
    setEnquiry(current => ({ ...current, [key]: value }));
    setDraft(null);
    setError('');
  };
  return (
    <section id="bulk-orders" aria-labelledby="bulk-orders-heading"
      className={isPage ? 'w-full scroll-mt-24' : 'mx-auto mt-8 w-full max-w-6xl scroll-mt-24 px-4 sm:mt-16'}>
      <div className="rounded-2xl border border-mustard/50 bg-mustard/10 p-5 text-cocoa sm:p-8">
        <p className="text-sm font-semibold">Thoughtful gifts, made by hand</p>
        <h2 id="bulk-orders-heading" className="mt-2 font-heading text-2xl font-bold sm:text-3xl">{isPage ? 'Handmade gifts for teams, clients & celebrations' : bulkOrders.title}</h2>
        <p className="mt-3 max-w-3xl text-sm sm:text-base">{bulkOrders.description}</p>
        <p className="mt-3 text-sm">Share your quantity, budget, occasion and required delivery date to help us plan your enquiry.</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {isPage ? <button type="button" aria-expanded={formOpen} aria-controls="bulk-order-form"
            onClick={() => setFormOpen(open => !open)}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-cocoa px-5 py-3 font-semibold text-cream hover:bg-cocoa/90">
            {formOpen ? 'Hide enquiry form' : 'Email for bulk orders'}
          </button> : <a href={bulkOrders.path}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-cocoa px-5 py-3 font-semibold text-cream hover:bg-cocoa/90">
            Plan your bulk order
          </a>}
          <a href={getBulkOrderWhatsAppLink()} target="_blank" rel="noopener noreferrer"
            onClick={() => trackContactClick('whatsapp', 'bulk_orders')}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-cocoa px-5 py-3 font-semibold hover:bg-white/70">
            <WhatsAppIcon />Enquire on WhatsApp
          </a>
        </div>
        {isPage && formOpen && <form id="bulk-order-form" aria-label="Bulk order email enquiry" className="mt-5 rounded-xl bg-white p-4 sm:p-6"
          onSubmit={event => {
            event.preventDefault();
            if (fields.some(field => field.required && !enquiry[field.key].trim())) {
              setError('Please complete all required fields before preparing your email.'); return;
            }
            setError('');
            setDraft(buildBulkOrderEmail(enquiry));
          }}>
          <h3 className="font-heading text-xl font-bold">Tell us about your gifting plans</h3>
          <p className="mt-2 text-sm">Prepare your enquiry below, then open the draft in your email app to review and send it to {bulkOrders.email}. This form does not send an email automatically or save your details on our server.</p>
          <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
            {fields.map(field => <label key={field.key} className="min-w-0 text-sm font-semibold">
              {field.label}
              <input type={field.type} required={field.required} maxLength={field.maxLength}
                min={field.type === 'number' ? 1 : undefined}
                step={field.key === 'quantity' ? 1 : field.key === 'budget' ? '0.01' : undefined}
                autoComplete={field.key === 'name' ? 'name' : field.key === 'company' ? 'organization' : field.key === 'email' ? 'email' : undefined}
                value={enquiry[field.key]} onChange={event => change(field.key, event.target.value)}
                className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/30 bg-white p-2 font-normal" />
            </label>)}
            <label className="text-sm font-semibold sm:col-span-2">Customisation / packaging preferences (optional)
              <textarea rows={3} maxLength={500} value={enquiry.preferences}
                onChange={event => change('preferences', event.target.value)}
                className="mt-1 block w-full rounded-lg border border-cocoa/30 p-2 font-normal" />
            </label>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          <button className="mt-4 min-h-11 rounded-full bg-cocoa px-5 py-3 font-semibold text-cream">Prepare email draft</button>
          {draft && <section aria-label="Your email draft" className="mt-4 rounded-xl border border-mustard/40 bg-cream/60 p-4">
            <p role="status" className="text-sm font-semibold">Your draft is ready. Review it and send it from your email app.</p>
            <p className="mt-2 break-words text-sm"><strong>Subject:</strong> {draft.subject}</p>
            <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm">{draft.body}</pre>
            <a href={draft.href} onClick={() => trackContactClick('email', 'bulk_orders')}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-cocoa px-5 py-3 font-semibold text-cream">
              Open email draft
            </a>
            <p className="mt-2 text-xs">No email app configured? Copy this message and email {bulkOrders.email}.</p>
          </section>}
        </form>}
        <p className="mt-3 text-sm">Prefer to write directly? <a href={`mailto:${bulkOrders.email}?subject=${encodeURIComponent(bulkOrders.subject)}`}
          onClick={() => trackContactClick('email', 'bulk_orders')}
          className="inline-flex min-h-11 max-w-full items-center break-all underline underline-offset-4">{bulkOrders.email}</a></p>
        <p className="mt-4 max-w-3xl text-xs text-cocoa/75">{bulkOrders.note}</p>
      </div>
    </section>
  );
}
