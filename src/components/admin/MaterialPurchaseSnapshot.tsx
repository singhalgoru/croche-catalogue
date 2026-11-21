import { useEffect, useId, useState } from 'react';
import { fetchMaterialPurchases, summarizeMaterialPurchases, type MaterialPurchase } from '../../services/materialPurchases';
import { formatINRExact } from '../../utils/currency';
import { localDate } from '../../utils/date';

export default function MaterialPurchaseSnapshot({ refreshKey }: { refreshKey: number }) {
  const [expanded, setExpanded] = useState(false);
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [rows, setRows] = useState<MaterialPurchase[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
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
  return <section aria-label="Material purchase snapshot" className="mt-5 rounded-2xl border border-mustard/40 bg-white p-4">
    <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(current => !current)}
      className="flex w-full items-center justify-between gap-3 text-left font-heading text-xl font-bold text-cocoa">
      <span>Material purchase snapshot</span><span aria-hidden="true">{expanded ? '−' : '+'}</span>
    </button>
    <div id={panelId} hidden={!expanded}>
      <p className="mt-2 text-sm text-cocoa/70">Purchase totals by purchase month, not payment date. Separate from Sales profit and stock; partial payments are not tracked. Manage purchases and receipts in Materials.</p>
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
      </div>}
    </div>
  </section>;
}
