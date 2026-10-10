import { useEffect, useState } from 'react';
import { fetchCampaignCoupons, generateCampaignCoupon, setCampaignCouponEnabled } from '../../services/customer';
import type { CampaignCoupon } from '../../types/customer';

const localDateTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export default function CouponGenerator() {
  const [coupons, setCoupons] = useState<CampaignCoupon[]>([]);
  const [percent, setPercent] = useState(10);
  const [cap, setCap] = useState(100);
  const [minimum, setMinimum] = useState(500);
  const [maxUses, setMaxUses] = useState(1);
  const [firstOrder, setFirstOrder] = useState(false);
  const [expiry, setExpiry] = useState(() => localDateTime(new Date(Date.now() + 30 * 86400000)));
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let current = true;
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    void fetchCampaignCoupons().then(value => { if (current) setCoupons(value); },
      error => { if (current) setError(error instanceof Error ? error.message : 'Unable to load coupons.'); });
    return () => { current = false; window.clearInterval(timer); };
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to update coupon.'); }
    finally { setBusy(false); }
  };
  return (
    <section className="mb-8 rounded-2xl border border-mustard/40 bg-white p-5 text-cocoa shadow-sm">
      <h2 className="font-heading text-2xl font-bold">Generate discount coupons</h2>
      <p className="mt-2 text-sm text-cocoa/70">Generate a random code to share with customers. Choose an exact expiry date/time and total usage limit. First-order-only codes require a verified email account.</p>
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          const coupon = await generateCampaignCoupon({
            percent, cap, minimum, maxUses, firstOrder, expiresAt: new Date(expiry).toISOString(),
          });
          setCoupons(current => [coupon, ...current].slice(0, 50));
          setMessage(`Generated ${coupon.code}. Expires ${new Date(coupon.expires_at).toLocaleString()}.`);
        });
      }}>
        {([
          ['Coupon discount (%)', percent, setPercent, 50], ['Coupon maximum discount (₹)', cap, setCap, 10000],
          ['Coupon minimum subtotal (₹)', minimum, setMinimum, 100000], ['Total coupon uses', maxUses, setMaxUses, 10000],
        ] as const).map(([label, value, set, max]) => <label key={label} className="text-sm">{label}
          <input type="number" required min={1} max={max} step={1} value={value} disabled={busy}
            onChange={event => set(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-mustard/60 p-2" />
        </label>)}
        <label className="text-sm">Coupon expiry (your local time)
          <input type="datetime-local" required value={expiry} disabled={busy}
            min={localDateTime(new Date(now))} max={localDateTime(new Date(now + 365 * 86400000))}
            onChange={event => setExpiry(event.target.value)} className="mt-1 w-full rounded-xl border border-mustard/60 p-2" />
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={firstOrder} disabled={busy}
          onChange={event => setFirstOrder(event.target.checked)} /> First order only</label>
        <button disabled={busy} className="rounded-full bg-cocoa px-4 py-2 font-semibold text-white">{busy ? 'Please wait…' : 'Generate random coupon'}</button>
      </form>
      {message && <p role="status" className="mt-3 break-words text-sm">{message}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <ul className="mt-4 divide-y divide-mustard/30">
        {coupons.map(coupon => <li key={coupon.id} className="py-3 text-sm">
          <p className="break-words font-semibold">{coupon.code}</p>
          <p>{coupon.percent}% off, max ₹{coupon.max_discount_rupees}, minimum ₹{coupon.minimum_subtotal_rupees}.</p>
          <p>{coupon.first_order_only ? 'First order only' : 'Any customer'} · {coupon.max_redemptions} total use{coupon.max_redemptions === 1 ? '' : 's'}</p>
          <p>Expires {new Date(coupon.expires_at).toLocaleString()} · {new Date(coupon.expires_at).getTime() <= now ? 'Expired' : coupon.enabled ? 'Enabled' : 'Disabled'}</p>
          <div className="mt-2 flex gap-4">
            <button type="button" disabled={busy} className="underline" onClick={() => { void run(async () => {
              await navigator.clipboard.writeText(coupon.code); setMessage('Coupon code copied.');
            }); }}>Copy code</button>
            <button type="button" disabled={busy} className="underline" onClick={() => { void run(async () => {
              await setCampaignCouponEnabled(coupon.id, !coupon.enabled);
              setCoupons(current => current.map(item => item.id === coupon.id ? { ...item, enabled: !item.enabled } : item));
              setMessage(coupon.enabled ? 'Coupon disabled for new orders.' : 'Coupon enabled; its original expiry still applies.');
            }); }}>{coupon.enabled ? 'Disable coupon' : 'Enable coupon'}</button>
          </div>
        </li>)}
      </ul>
      <p className="mt-2 text-xs text-cocoa/60">Latest 50 coupons. Already-issued payment links keep their agreed discount; disabling a code prevents new uses.</p>
    </section>
  );
}
