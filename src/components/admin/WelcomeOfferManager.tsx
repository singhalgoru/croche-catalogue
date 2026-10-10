import { useEffect, useState } from 'react';
import { fetchWelcomeOffer, saveWelcomeOffer } from '../../services/customer';
import type { WelcomeOffer } from '../../types/customer';

export default function WelcomeOfferManager() {
  const [offer, setOffer] = useState<WelcomeOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let current = true;
    void fetchWelcomeOffer().then(value => { if (current) setOffer(value); },
      error => { if (current) setError(error instanceof Error ? error.message : 'Unable to load offer.'); });
    return () => { current = false; };
  }, []);
  return (
    <section className="mb-8 rounded-2xl border border-mustard/40 bg-white p-5 text-cocoa shadow-sm">
      <h2 className="font-heading text-2xl font-bold">First-order coupon — ILOVELUVIA</h2>
      <p className="mt-2 text-sm text-cocoa/70">ILOVELUVIA can be used only once per verified email address. Enable after approving these terms and testing email verification. Resend is required only to email the coupon. Shipping is excluded.</p>
      {offer && <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event => {
        event.preventDefault(); setBusy(true); setError(''); setMessage('');
        void saveWelcomeOffer(offer).then(() => setMessage('Welcome offer saved.'))
          .catch(error => setError(error instanceof Error ? error.message : 'Unable to save offer.'))
          .finally(() => setBusy(false));
      }}>
        {([
          ['percent', 'Discount (%)', 1, 50], ['maxDiscountRupees', 'Maximum discount (₹)', 1, 10000],
          ['minimumSubtotalRupees', 'Minimum items subtotal (₹)', 1, 100000], ['validDays', 'Validity (days)', 1, 365],
        ] as const).map(([key, label, min, max]) => <label key={key} className="text-sm">{label}
          <input type="number" min={min} max={max} step={1} required value={offer[key]} disabled={busy}
            onChange={event => setOffer({ ...offer, [key]: Number(event.target.value) })}
            className="mt-1 w-full rounded-xl border border-mustard/60 p-2" />
        </label>)}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={offer.enabled} disabled={busy}
          onChange={event => setOffer({ ...offer, enabled: event.target.checked })} /> Enable welcome offer</label>
        <button disabled={busy} className="rounded-full bg-cocoa px-4 py-2 font-semibold text-white">{busy ? 'Saving…' : 'Save welcome offer'}</button>
      </form>}
      {message && <p role="status" className="mt-2 text-sm">{message}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
