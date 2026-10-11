import { useEffect, useState } from 'react';
import { deleteCampaignCoupon, fetchCampaignCoupons, generateCampaignCoupon, setCampaignCouponArchived, setCampaignCouponEnabled } from '../../services/customer';
import type { CampaignCoupon } from '../../types/customer';

const localDateTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export default function CouponGenerator() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [coupons, setCoupons] = useState<CampaignCoupon[]>([]);
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
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
    void fetchCampaignCoupons(archived).then(value => { if (current) setCoupons(value); },
      error => { if (current) { setCoupons([]); setError(error instanceof Error ? error.message : 'Unable to load coupons.'); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; window.clearInterval(timer); };
  }, [archived, refresh]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to update coupon.'); }
    finally { setBusy(false); }
  };
  return (
    <section className="mb-8 rounded-2xl border border-mustard/40 bg-white p-5 text-cocoa shadow-sm">
      <button type="button" aria-expanded={isExpanded} aria-controls="discount-coupon-content"
        onClick={() => setIsExpanded(current => !current)}
        className="flex w-full items-center justify-between gap-4 text-left">
        <span className="font-heading text-2xl font-bold">Generate discount coupons</span>
        <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mustard/20 text-xl transition-transform ${isExpanded ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      <div id="discount-coupon-content" hidden={!isExpanded}>
      <p className="mt-2 text-sm text-cocoa/70">Generate a random code to share with customers. Choose an exact expiry date/time and total usage limit. First-order-only codes require a verified email account.</p>
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          const coupon = await generateCampaignCoupon({
            percent, cap, minimum, maxUses, firstOrder, expiresAt: new Date(expiry).toISOString(),
          });
          if (archived) { setLoading(true); setArchived(false); }
          else setCoupons(current => [coupon, ...current].slice(0, 50));
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
        <button disabled={busy || loading} className="rounded-full bg-cocoa px-4 py-2 font-semibold text-white">{busy ? 'Please wait…' : 'Generate random coupon'}</button>
      </form>
      {message && <p role="status" className="mt-3 break-words text-sm">{message}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <nav aria-label="Coupon views" className="mt-4 flex flex-wrap gap-3">
        {([false, true] as const).map(view => <button key={String(view)} type="button" disabled={busy || loading || archived === view}
          aria-pressed={archived === view} onClick={() => { setLoading(true); setError(''); setCoupons([]); setArchived(view); setMessage(''); }}
          className={`min-h-11 rounded-full border border-cocoa/30 px-4 py-2 text-sm disabled:opacity-50 ${archived === view ? 'bg-cocoa text-white' : ''}`}>
          {view ? 'Archived coupons' : 'Current coupons'}
        </button>)}
        <button type="button" disabled={busy || loading} onClick={() => { setLoading(true); setError(''); setRefresh(value => value + 1); }}
          className="min-h-11 text-sm underline disabled:opacity-50">Refresh coupons</button>
      </nav>
      {loading && <p role="status" className="mt-3 text-sm">Loading coupons...</p>}
      {!loading && !error && coupons.length === 0 && <p className="mt-3 text-sm">{archived ? 'No archived coupons.' : 'No current coupons.'}</p>}
      <ul className="mt-4 divide-y divide-mustard/30">
        {coupons.map(coupon => <li key={coupon.id} className="py-3 text-sm">
          <p className="break-words font-semibold">{coupon.code}</p>
          <p>{coupon.percent}% off, max ₹{coupon.max_discount_rupees}, minimum ₹{coupon.minimum_subtotal_rupees}.</p>
          <p>{coupon.first_order_only ? 'First order only' : 'Any customer'} · {coupon.max_redemptions} total use{coupon.max_redemptions === 1 ? '' : 's'}</p>
          <p>Usage: {coupon.used_count} of {coupon.max_redemptions} used{coupon.reserved_count > 0 ? ` · ${coupon.reserved_count} pending payment` : ''}</p>
          <p>Expires {new Date(coupon.expires_at).toLocaleString()} · {coupon.archived_at ? 'Archived · ' : ''}{
            coupon.used_count >= coupon.max_redemptions ? 'Used'
              : new Date(coupon.expires_at).getTime() <= now ? 'Expired'
                : !coupon.enabled ? 'Disabled'
                  : coupon.used_count + coupon.reserved_count >= coupon.max_redemptions ? 'Reserved'
                    : coupon.used_count > 0 ? 'Partially used · Enabled' : 'Enabled'}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            <button type="button" disabled={busy || loading} className="underline" onClick={() => { void run(async () => {
              await navigator.clipboard.writeText(coupon.code); setMessage('Coupon code copied.');
            }); }}>Copy code</button>
            {!archived && <button type="button" disabled={busy || loading || coupon.used_count >= coupon.max_redemptions} className="underline disabled:opacity-50" onClick={() => { void run(async () => {
              await setCampaignCouponEnabled(coupon.id, !coupon.enabled);
              setCoupons(current => current.map(item => item.id === coupon.id ? { ...item, enabled: !item.enabled } : item));
              setMessage(coupon.enabled ? 'Coupon disabled for new orders.' : 'Coupon enabled; its original expiry still applies.');
            }); }}>{coupon.enabled ? 'Disable coupon' : 'Enable coupon'}</button>}
            <button type="button" disabled={busy || loading} className="underline" onClick={() => { void run(async () => {
              await setCampaignCouponArchived(coupon.id, !archived);
              setCoupons(current => current.filter(item => item.id !== coupon.id));
              setMessage(archived ? 'Coupon restored to the current list. It remains disabled; expiry and usage limits still apply.'
                : 'Coupon archived and disabled for new orders. Existing payment links and redemption history are preserved.');
            }); }}>{archived ? 'Restore coupon' : 'Archive coupon'}</button>
            <button type="button" disabled={busy} className="text-red-700 underline"
              aria-label={`Delete coupon ${coupon.code}`} onClick={() => {
                if (!window.confirm(`Delete coupon ${coupon.code}? Customers will no longer be able to use it.`)) return;
                void run(async () => {
                  await deleteCampaignCoupon(coupon.id);
                  setCoupons(current => current.filter(item => item.id !== coupon.id));
                  setMessage(`Coupon ${coupon.code} deleted.`);
                });
              }}>Delete coupon</button>
          </div>
        </li>)}
      </ul>
      <p className="mt-2 text-xs text-cocoa/60">Latest 50 coupons in this view. Refresh to see new redemptions. Used means the total usage limit has been reached by paid orders or confirmed offline redemptions; pending payments reserve capacity separately. Archiving disables new uses without deleting history. Restoring does not re-enable a coupon or reset its usage or expiry. Already-issued payment links keep their agreed discount. Only coupons never used on an order can be deleted.</p>
      </div>
    </section>
  );
}
