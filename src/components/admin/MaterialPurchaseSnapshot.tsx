import { useEffect, useId, useState } from 'react';
import { downloadMaterialReceipt, fetchMaterialPurchases, materialCategories, purchaseBreakdown, purchaseGroupName, setMaterialPurchaseCategory,
  type MaterialCategory, type MaterialPurchase } from '../../services/materialPurchases';
import { formatINRExact } from '../../utils/currency';
import { formatDate, localDate } from '../../utils/date';
import AdminDialog from './AdminDialog';
import FinancialPeriodCards from './FinancialPeriodCards';
import { calendarPeriods, isSnapshotYear } from './salesPeriodSummary';

function PurchaseDetails({ purchase, onBusyChange, onCategoryChange }: {
  purchase: MaterialPurchase; onBusyChange: (change: number) => void; onCategoryChange: (id: string, category: MaterialCategory) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState(purchase.category);
  const download = async () => {
    setBusy(true); setError(''); onBusyChange(1);
    try { await downloadMaterialReceipt(purchase.id); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to download receipt.'); }
    finally { setBusy(false); onBusyChange(-1); }
  };
  return <li className="space-y-3 rounded-xl border border-mustard/40 bg-white p-4 text-sm">
      <h3 className="font-heading text-lg font-bold break-words">{formatDate(purchase.purchased_on)} · {purchase.material}</h3>
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
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">Category for {purchase.material}
          <select className="ml-2 min-h-11 rounded border p-2" value={category} disabled={busy} onChange={event => {
            const value = materialCategories.find(item => item === event.target.value);
            if (value) setCategory(value);
          }}>{materialCategories.map(value => <option key={value}>{value}</option>)}</select>
        </label>
        <button type="button" disabled={busy || category === purchase.category} className="min-h-11 rounded-full border px-4 disabled:opacity-50"
          onClick={() => {
            setBusy(true); setError(''); onBusyChange(1);
            void setMaterialPurchaseCategory(purchase.id, category).then(() => onCategoryChange(purchase.id, category))
              .catch(failure => setError(failure instanceof Error ? failure.message : 'Unable to update category.'))
              .finally(() => { setBusy(false); onBusyChange(-1); });
          }}>Save category</button>
      </div>
      {purchase.receipt_name
        ? <button type="button" disabled={busy} onClick={() => void download()}
          className="min-h-11 rounded-full border border-cocoa/30 px-4 py-2 font-semibold disabled:opacity-50">
          {busy ? 'Downloading…' : `Download receipt: ${purchase.receipt_name}`}
        </button>
        : <p>No receipt attached.</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </li>;
}

export default function MaterialPurchaseSnapshot({ refreshKey }: { refreshKey: number }) {
  const [expanded, setExpanded] = useState(false);
  const [year, setYear] = useState(() => localDate().slice(0, 4));
  const [rows, setRows] = useState<MaterialPurchase[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<{ label: string; purchases: MaterialPurchase[] } | null>(null);
  const [filter, setFilter] = useState<{ group: 'category' | 'supplier'; name: string } | null>(null);
  const [downloadsInProgress, setDownloadsInProgress] = useState(0);
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
  const cards = rows && isSnapshotYear(year) ? calendarPeriods(year).map(period => {
    const purchases = rows.filter(item => {
      const monthNumber = Number(item.purchased_on.slice(5, 7));
      return item.purchased_on.startsWith(`${year}-`) && monthNumber >= period.startMonth && monthNumber <= period.endMonth;
    });
    const paid = purchases.filter(item => item.payment_status === 'Paid')
      .reduce((sum, item) => sum + Math.round(item.total * 100), 0);
    const unpaid = purchases.filter(item => item.payment_status === 'Unpaid')
      .reduce((sum, item) => sum + Math.round(item.total * 100), 0);
    return { label: period.label, action: {
      label: `View purchases for ${period.label}`,
      onClick: () => setSelected({ label: period.label, purchases: [...purchases].sort((a, b) =>
        b.purchased_on.localeCompare(a.purchased_on) || a.id.localeCompare(b.id)) }),
    }, metrics: [
      { label: 'Purchase value', value: formatINRExact((paid + unpaid) / 100) },
      { label: 'Paid', value: formatINRExact(paid / 100) },
      { label: 'Unpaid', value: formatINRExact(unpaid / 100) },
      { label: 'Purchases', value: String(purchases.length) },
    ] };
  }) : null;
  const updateCategory = (id: string, category: MaterialCategory) => {
    setRows(current => current?.map(purchase => purchase.id === id ? { ...purchase, category } : purchase) ?? null);
    setSelected(current => current ? { ...current, purchases: current.purchases.map(purchase =>
      purchase.id === id ? { ...purchase, category } : purchase) } : null);
  };
  const filteredPurchases = selected && filter ? selected.purchases.filter(purchase =>
    purchaseGroupName(purchase, filter.group).toLocaleLowerCase() === filter.name.toLocaleLowerCase()) : [];
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
      <button type="button" className="mt-3 min-h-11 rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold"
        onClick={() => setRetry(value => value + 1)}>Refresh materials</button>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!error && rows === null && <p role="status" className="mt-3 text-sm">Loading material purchases…</p>}
    </div>
    {selected && <AdminDialog title={`Purchases · ${selected.label}`} onClose={() => { setSelected(null); setFilter(null); }} busy={downloadsInProgress > 0}>
      <div className="space-y-4 p-4">
        <p className="text-sm">Newest purchases first. To edit or delete a purchase, go to Admin → Materials.</p>
        {selected.purchases.length === 0 ? <p>No purchases recorded for this period.</p>
          : <>
            <div className="grid gap-3 sm:grid-cols-2">{(['category', 'supplier'] as const).map(group =>
              <section key={group} aria-label={`Purchases by ${group}`} className="rounded border p-3 text-sm">
                <h3 className="font-semibold">By {group}</h3>
                <ul>{purchaseBreakdown(selected.purchases, group).map(item =>
                  <li key={item.name}><button type="button" disabled={downloadsInProgress > 0}
                    aria-label={`View ${group} ${item.name} purchases`}
                    onClick={() => setFilter({ group, name: item.name })}
                    className="min-h-11 text-left underline underline-offset-2 disabled:opacity-50">
                    {item.name}: {formatINRExact(item.total)}</button></li>)}</ul>
              </section>)}</div>
            <ul className="space-y-3">{selected.purchases.map(purchase =>
              <PurchaseDetails key={purchase.id} purchase={purchase} onCategoryChange={updateCategory}
                onBusyChange={change => setDownloadsInProgress(count => count + change)} />)}</ul>
          </>}
      </div>
    </AdminDialog>}
    {selected && filter && <AdminDialog title={`Purchases · ${filter.name} · ${selected.label}`}
      onClose={() => setFilter(null)} busy={downloadsInProgress > 0}>
      <div className="space-y-4 p-4">
        <p className="text-sm">Newest purchases first. To edit or delete a purchase, go to Admin → Materials.</p>
        {filteredPurchases.length === 0
          ? <p>No purchases in this group.</p>
          : <ul className="space-y-3">{filteredPurchases
            .map(purchase => <PurchaseDetails key={purchase.id} purchase={purchase} onCategoryChange={updateCategory}
              onBusyChange={change => setDownloadsInProgress(count => count + change)} />)}</ul>}
      </div>
    </AdminDialog>}
  </section>;
}
