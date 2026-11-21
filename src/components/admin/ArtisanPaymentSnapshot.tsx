import { useEffect, useState } from 'react';
import { fetchArtisanPaymentSummary, type ArtisanPaymentSummary } from '../../services/artisanProfiles';
import { formatDate, localDate } from '../../utils/date';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

export default function ArtisanPaymentSnapshot({ refreshKey }: { refreshKey: number }) {
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [retry, setRetry] = useState(0);
  const [rows, setRows] = useState<ArtisanPaymentSummary[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (refreshKey === 0 || !month) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setRows(null);
      setError('');
      void fetchArtisanPaymentSummary(month).then(data => {
        if (active) setRows(data);
      }).catch(failure => {
        if (active) setError(failure instanceof Error ? failure.message : 'Unable to load payment snapshot.');
      }).finally(() => {
        if (active) setLoading(false);
      });
    });
    return () => { active = false; };
  }, [month, refreshKey, retry]);

  const totalPaise = rows?.reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  return <section aria-label="Artisan payment snapshot" className="mt-5 rounded-2xl border border-mustard/40 bg-white p-4">
    <h3 className="font-heading text-xl font-bold text-cocoa">Artisan payment snapshot</h3>
    <p className="mt-2 text-sm text-cocoa/70">Payments already recorded for the selected month, excluding voided entries. This does not show amounts owed or send payments. Payments are separate from Sales business expenses and sales labour costs.</p>
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="text-sm font-semibold">Payment month
        <input type="month" value={month} onChange={event => setMonth(event.target.value)}
          className="mt-1 block min-h-11 rounded-lg border border-mustard/50 bg-white px-3 py-2" />
      </label>
      <button type="button" disabled={loading || !month} onClick={() => setRetry(value => value + 1)}
        className="min-h-11 rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold disabled:opacity-50">Refresh payments</button>
    </div>
    {!month && <p role="status" className="mt-3 text-sm">Choose a payment month.</p>}
    {loading && <p role="status" className="mt-3 text-sm">Loading artisan payments…</p>}
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {month && !loading && rows && <>
      <p className="mt-4 font-semibold">Total paid: {currency.format((totalPaise ?? 0) / 100)} · {rows.length} artisan{rows.length === 1 ? '' : 's'}</p>
      {rows.length === 0 ? <p className="mt-2 text-sm">No payments recorded for this month.</p> :
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">{rows.map(row =>
          <li key={row.artisanId} className="rounded-xl border border-mustard/40 p-3">
            <p className="break-words font-semibold">{row.name}</p>
            <p className="font-heading text-xl font-bold">{currency.format(row.amount)}</p>
            <p className="text-sm">{row.count} payment{row.count === 1 ? '' : 's'} · Latest: {formatDate(row.latestDate)}</p>
          </li>)}</ul>}
      <p className="mt-3 text-xs">For individual payment entries or private payout details, open Admin → Artisans and review the artisan.</p>
    </>}
  </section>;
}
