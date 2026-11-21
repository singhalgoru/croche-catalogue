import { useEffect, useId, useState } from 'react';
import { downloadMaterialReceipt, fetchMaterialPurchases, summarizeMaterialPurchases, type MaterialPurchase } from '../../services/materialPurchases';
import { formatINRExact } from '../../utils/currency';
import { formatDate, localDate } from '../../utils/date';
import AdminDialog from './AdminDialog';
import FinancialPeriodCards from './FinancialPeriodCards';
import { calendarPeriods, isSnapshotYear } from './salesPeriodSummary';

function PurchaseDetails({ purchase, onClose }: { purchase: MaterialPurchase; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const download = async () => {
    setBusy(true); setError('');
    try { await downloadMaterialReceipt(purchase.id); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to download receipt.'); }
    finally { setBusy(false); }
  };
  return <AdminDialog title={`Purchase details: ${purchase.material}`} onClose={onClose} busy={busy}>
    <div className="space-y-4 p-4 text-sm">
      <p>To edit or delete this purchase, go to Admin → Materials.</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          ['Purchase date', formatDate(purchase.purchased_on)],
          ['Material', purchase.material],
          ['Supplier', purchase.supplier || 'Not provided'],
          ['Quantity', `${purchase.quantity} ${purchase.unit}`],
          ['Total purchase cost', formatINRExact(purchase.total)],
          ['Payment status', purchase.payment_status],
        ].map(([label, value]) => <div key={label} className="min-w-0">
          <dt className="text-cocoa/65">{label}</dt>
          <dd className="break-words font-semibold">{value}</dd>
        </div>)}
      </dl>
      {purchase.notes && <div><p className="text-cocoa/65">Notes</p>
        <p className="whitespace-pre-wrap break-words">{purchase.notes}</p></div>}
      {purchase.receipt_name
        ? <button type="button" disabled={busy} onClick={() => void download()}
          className="min-h-11 rounded-full border border-cocoa/30 px-4 py-2 font-semibold disabled:opacity-50">
          {busy ? 'Downloading…' : `Download receipt: ${purchase.receipt_name}`}
        </button>
        : <p>No receipt attached.</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </div>
  </AdminDialog>;
}

export default function MaterialPurchaseSnapshot({ refreshKey }: { refreshKey: number }) {
  const [expanded, setExpanded] = useState(false);
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [year, setYear] = useState(() => localDate().slice(0, 4));
  const [rows, setRows] = useState<MaterialPurchase[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<MaterialPurchase | null>(null);
  const panelId = useId();
  useEffect(() => {
    if (!refreshKey) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setRows(null); setError('');
      void fetchMaterialPurchases().then(data => { if (active) setRows(data); })
        .catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'Unable to load material snapshot.'); });
    });
    return () => { active = false; };
  }, [refreshKey, retry]);
  const summary = rows && month ? summarizeMaterialPurchases(rows, month) : null;
  const cards = rows && isSnapshotYear(year) ? calendarPeriods(year).map(period => {
    const purchases = rows.filter(item => {
      const monthNumber = Number(item.purchased_on.slice(5, 7));
      return item.purchased_on.startsWith(`${year}-`) && monthNumber >= period.startMonth && monthNumber <= period.endMonth;
    });
    const paid = purchases.filter(item => item.payment_status === 'Paid')
      .reduce((sum, item) => sum + Math.round(item.total * 100), 0);
    const unpaid = purchases.filter(item => item.payment_status === 'Unpaid')
      .reduce((sum, item) => sum + Math.round(item.total * 100), 0);
    return { label: period.label, metrics: [
      { label: 'Purchase value', value: formatINRExact((paid + unpaid) / 100) },
      { label: 'Paid', value: formatINRExact(paid / 100) },
      { label: 'Unpaid', value: formatINRExact(unpaid / 100) },
      { label: 'Purchases', value: String(purchases.length) },
    ] };
  }) : null;
  return <section aria-label="Material purchase snapshot" className="mt-5 rounded-2xl border border-mustard/40 bg-white p-4">
    <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(current => !current)}
      className="flex w-full items-center justify-between gap-3 text-left font-heading text-xl font-bold text-cocoa">
      <span>Material purchase snapshot</span><span aria-hidden="true">{expanded ? '−' : '+'}</span>
    </button>
    <div id={panelId} hidden={!expanded}>
      <p className="mt-2 text-sm text-cocoa/70">Totals use purchase date, not payment date. Calendar periods run January–December; the current year and quarter may be incomplete. Separate from Sales profit and stock; partial payments are not tracked. Manage purchases and receipts in Materials.</p>
      <label className="mt-3 block text-sm font-semibold">Material snapshot year
        <input type="number" min="1" max="9999" step="1" value={year} onChange={event => setYear(event.target.value)}
          className="ml-2 min-h-11 w-28 rounded-lg border border-mustard/50 bg-white px-3 py-2" />
      </label>
      {!isSnapshotYear(year) ? <p className="mt-3 text-sm">Enter a four-digit purchase year.</p>
        : cards && <FinancialPeriodCards cards={cards} />}
      <h3 className="mt-5 font-heading text-lg font-bold">Monthly purchase details</h3>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">Material purchase month
          <input type="month" value={month} onChange={event => setMonth(event.target.value)}
            className="mt-1 block min-h-11 rounded-lg border border-mustard/50 bg-white px-3 py-2" />
        </label>
        <button type="button" className="min-h-11 rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold"
          onClick={() => setRetry(value => value + 1)}>Refresh materials</button>
      </div>
      {!month && <p className="mt-3 text-sm">Choose a purchase month.</p>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!error && rows === null && <p role="status" className="mt-3 text-sm">Loading material purchases…</p>}
      {summary && <div className="mt-3 text-sm">
        <p className="font-semibold">Purchase value: {formatINRExact(summary.paid + summary.unpaid)} · Paid: {formatINRExact(summary.paid)} · Unpaid: {formatINRExact(summary.unpaid)}</p>
        <p>{summary.monthly.length} purchase{summary.monthly.length === 1 ? '' : 's'}</p>
        {summary.materials.length > 0 && <ul className="mt-2">{summary.materials.map(item =>
          <li key={item.name}>{item.name}: {formatINRExact(item.total)}</li>)}</ul>}
        {summary.monthly.length > 0 && <ul className="mt-3 grid gap-3 sm:grid-cols-2">{summary.monthly.map(purchase =>
          <li key={purchase.id}>
            <button type="button" aria-label={`View purchase ${purchase.material} on ${formatDate(purchase.purchased_on)}`}
              onClick={() => setSelected(purchase)}
              className="h-full w-full rounded-xl border border-mustard/40 p-3 text-left hover:bg-cream/70">
              <span className="block break-words font-semibold">{purchase.material}</span>
              <span className="block font-heading text-xl font-bold">{formatINRExact(purchase.total)}</span>
              <span className="block">{formatDate(purchase.purchased_on)} · {purchase.payment_status}</span>
              <span className="mt-1 inline-block underline">View purchase details</span>
            </button>
          </li>)}</ul>}
      </div>}
    </div>
    {selected && <PurchaseDetails purchase={selected} onClose={() => setSelected(null)} />}
  </section>;
}
