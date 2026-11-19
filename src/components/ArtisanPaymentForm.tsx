import { useState } from 'react';
import { emptyArtisanPayment, submitPaymentDetails } from '../services/artisanPaymentDetails';
import ArtisanPaymentFields from './ArtisanPaymentFields';

export default function ArtisanPaymentForm() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('payment') ?? '');
  const [details,setDetails] = useState(emptyArtisanPayment);
  const [consent,setConsent] = useState(false);
  const [busy,setBusy] = useState(false);
  const [saved,setSaved] = useState(false);
  const [error,setError] = useState('');
  if (saved) return <section className="rounded-xl bg-white p-5"><p role="status">Payment details submitted for review. Your trial has not started yet.</p></section>;
  if (!/^[a-f0-9]{64}$/.test(token)) return <p role="alert">This payment link is invalid. Contact Luvia for a new link.</p>;
  return <section className="max-w-3xl space-y-3 rounded-xl bg-white p-5">
    <h2 className="font-heading text-2xl font-bold">Payment details for your paid trial</h2>
    <p>Provide either your UPI ID or bank account, in your own name. The holder name must match your application name. Do not share your UPI PIN, password or OTP.</p>
    <p className="text-sm">The link expires after 24 hours and works once. Your details are encrypted and accessible to authorised administrators for arranging your payment.
      They are retained for the working relationship and applicable accounting needs; contact hello@luviacreations.com for correction or deletion requests.</p>
    <form className="space-y-3" onSubmit={event => {
      event.preventDefault(); setBusy(true); setError('');
      void submitPaymentDetails(token,details).then(() => {
        setDetails(emptyArtisanPayment()); setSaved(true); window.history.replaceState(null,'',window.location.pathname);
      }).catch(failure => setError(failure instanceof Error ? failure.message : 'Unable to submit payment details.'))
        .finally(() => setBusy(false));
    }}>
      <fieldset disabled={busy} className="space-y-3">
        <ArtisanPaymentFields value={details} onChange={setDetails} />
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={consent}
          onChange={event => setConsent(event.target.checked)} />
          These payment details are in my own name and I consent to their use for arranging my payments.</label>
        {error && <p role="alert" className="text-red-700">{error} If submission may already have succeeded, contact Luvia before requesting a new link.</p>}
        <button className="min-h-11 rounded-full bg-cocoa px-5 py-2 font-semibold text-cream">{busy ? 'Submitting...' : 'Submit payment details'}</button>
      </fieldset>
    </form>
  </section>;
}
