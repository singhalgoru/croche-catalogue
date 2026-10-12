import { useEffect, useRef, useState } from 'react';
import { submitFeedback } from '../services/feedback';
import type { FeedbackInput } from '../services/feedback';

export default function FeedbackForm() {
  useEffect(() => {
    const title = document.title;
    document.title = 'Share feedback | Luvia Creations';
    return () => { document.title = title; };
  }, []);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<FeedbackInput['category']>('general');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [wantsReply, setWantsReply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const request = useRef<{ signature: string; id: string } | null>(null);
  return <section aria-label="Share feedback" className="rounded-2xl border border-mustard/40 bg-white p-4 text-left text-sm text-cocoa shadow-sm sm:p-6">
      <p className="mt-2">Help us improve Luvia. Only your feedback is required. Leave your email only if you would like a reply.</p>
      <p className="mt-2 text-xs">Used only to review your feedback and respond if requested. A session identifier is kept for abuse prevention; account contact details are not attached automatically. Website submissions are kept for up to 90 days; delivered emails remain in our feedback inbox. Please do not include passwords, payment details or sensitive personal information. For order/payment help, email <a href="mailto:orders@luviacreations.com" className="underline">orders@luviacreations.com</a>.</p>
      {saved && <p role="status" className="mt-3">Thank you! Your feedback has been saved and queued for feedback@luviacreations.com.</p>}
      <form aria-label="Share feedback form" className="mt-3 grid gap-3" onSubmit={event => {
        event.preventDefault(); setBusy(true); setError(''); setSaved(false);
        const signature = JSON.stringify({ message, category, name, email: wantsReply ? email : '', wantsReply });
        if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
        void submitFeedback({ message, category, name, email, wantsReply, requestId: request.current.id }).then(() => {
          setSaved(true); setMessage(''); setName(''); setEmail(''); setWantsReply(false); setCategory('general'); request.current = null;
        }).catch(failure => setError(failure instanceof Error ? failure.message : 'Unable to submit feedback.'))
          .finally(() => setBusy(false));
      }}>
        <label>Feedback type (optional)<select value={category} disabled={busy}
          onChange={event => {
            const value = event.target.value;
            if (value === 'general' || value === 'suggestion' || value === 'website' || value === 'product') setCategory(value);
          }} className="mt-1 block min-h-11 w-full rounded border p-2">
          <option value="general">General feedback</option><option value="suggestion">Suggestion</option>
          <option value="website">Website issue</option><option value="product">Product feedback</option>
        </select></label>
        <label>Your feedback<textarea required minLength={10} maxLength={3000} rows={4} value={message} disabled={busy}
          onChange={event => setMessage(event.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
        <label>Name (optional)<input maxLength={80} autoComplete="name" value={name} disabled={busy}
          onChange={event => setName(event.target.value)} className="mt-1 block min-h-11 w-full rounded border p-2" /></label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={wantsReply} disabled={busy}
          onChange={event => { setWantsReply(event.target.checked); if (!event.target.checked) setEmail(''); }} />I'd like a reply</label>
        {wantsReply && <label>Reply email<input type="email" required maxLength={254} autoComplete="email" value={email} disabled={busy}
          onChange={event => setEmail(event.target.value)} className="mt-1 block min-h-11 w-full rounded border p-2" /></label>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <button disabled={busy} className="min-h-11 justify-self-start rounded-full bg-cocoa px-5 py-2 font-semibold text-cream disabled:opacity-50">
          {busy ? 'Submitting...' : 'Send feedback'}
        </button>
      </form>
      <p className="mt-3 text-xs">Prefer email? Write to <a href="mailto:feedback@luviacreations.com" className="underline">feedback@luviacreations.com</a>. No phone number or address is needed. Feedback is private and is not published as a review.</p>
  </section>;
}
