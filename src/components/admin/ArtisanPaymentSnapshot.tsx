import { useEffect, useId, useState } from 'react';
import { fetchArtisanActivity, fetchArtisanPaymentSummary, fetchArtisanPaymentYear,
  type ArtisanPayment, type ArtisanPaymentMonth, type ArtisanPaymentSummary } from '../../services/artisanProfiles';
import { formatDate, localDate } from '../../utils/date';
import AdminDialog from './AdminDialog';
import FinancialPeriodCards from './FinancialPeriodCards';
import { calendarPeriods, isSnapshotYear } from './salesPeriodSummary';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

function PaymentDetails({ artisan, month, onClose }: {
  artisan: ArtisanPaymentSummary; month: string; onClose: () => void;
}) {
  const [payments, setPayments] = useState<ArtisanPayment[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setPayments(null);
      setError('');
      void fetchArtisanActivity(artisan.artisanId).then(activity => {
        if (active) setPayments(activity.payments.filter(payment =>
          payment.voided_at === null && payment.paid_on.startsWith(`${month}-`)));
      }).catch(failure => {
        if (active) setError(failure instanceof Error ? failure.message : 'Unable to load payment details.');
      });
    });
    return () => { active = false; };
  }, [artisan.artisanId, month, retry]);

  return <AdminDialog title={`Payments for ${artisan.name}`} onClose={onClose}>
    <div className="space-y-4 p-4">
      <p className="text-sm">Recorded payments for {month}, excluding voided entries. To correct a payment or view private payout details, review the artisan in Admin → Artisans.</p>
      {error ? <div><p role="alert" className="text-red-700">{error}</p>
        <button type="button" className="min-h-11 underline" onClick={() => setRetry(value => value + 1)}>Retry payment details</button></div>
        : payments === null ? <p role="status">Loading payment details…</p>
          : payments.length === 0 ? <p>No recorded payments remain for this month. Refresh the snapshot to update totals.</p>
            : <ul className="space-y-3">{payments.map(payment =>
              <li key={payment.id} className="rounded-xl border border-mustard/40 bg-white p-3">
                <p className="font-semibold">{formatDate(payment.paid_on)} · {currency.format(payment.amount)}</p>
                <p className="text-sm">Method: {payment.method}</p>
                {payment.reference && <p className="break-all text-sm">Transaction reference: {payment.reference}</p>}
                <p className="whitespace-pre-wrap break-words text-sm">Work / batch: {payment.description}</p>
              </li>)}</ul>}
    </div>
  </AdminDialog>;
}

export default function ArtisanPaymentSnapshot({ refreshKey }: { refreshKey: number }) {
  const [expanded, setExpanded] = useState(false);
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [year, setYear] = useState(() => localDate().slice(0, 4));
  const [retry, setRetry] = useState(0);
  const [rows, setRows] = useState<ArtisanPaymentSummary[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ArtisanPaymentSummary | null>(null);
  const [yearRows, setYearRows] = useState<{ year: string; data: ArtisanPaymentMonth[] } | null>(null);
  const [yearError, setYearError] = useState<{ year: string; message: string } | null>(null);
  const panelId = useId();

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

  useEffect(() => {
    if (!expanded || !refreshKey || !isSnapshotYear(year)) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setYearRows(null); setYearError(null);
      void fetchArtisanPaymentYear(year).then(data => { if (active) setYearRows({ year, data }); })
        .catch(failure => {
          if (active) setYearError({ year, message: failure instanceof Error ? failure.message : 'Unable to load payment periods.' });
        });
    });
    return () => { active = false; };
  }, [expanded, year, refreshKey, retry]);

  const totalPaise = rows?.reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  const cards = yearRows?.year === year && isSnapshotYear(year) ? calendarPeriods(year).map(period => {
    const payments = yearRows.data.filter(item => {
      const monthNumber = Number(item.month.slice(5, 7));
      return monthNumber >= period.startMonth && monthNumber <= period.endMonth;
    }).flatMap(item => item.payments);
    const paid = payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
    return { label: period.label, metrics: [
      { label: 'Total paid', value: currency.format(paid / 100) },
      { label: 'Payments', value: String(payments.reduce((sum, payment) => sum + payment.count, 0)) },
      { label: 'Artisans', value: String(new Set(payments.map(payment => payment.artisanId)).size) },
    ] };
  }) : null;
  return <section aria-label="Artisan payment snapshot" className="mt-5 rounded-2xl border border-mustard/40 bg-white p-4">
    <button type="button" aria-expanded={expanded} aria-controls={panelId}
      onClick={() => setExpanded(current => !current)}
      className="flex w-full items-center justify-between gap-3 text-left font-heading text-xl font-bold text-cocoa">
      <span>Artisan payment snapshot</span><span aria-hidden="true">{expanded ? '−' : '+'}</span>
    </button>
    <div id={panelId} hidden={!expanded}>
    <p className="mt-2 text-sm text-cocoa/70">Recorded payments exclude voided entries. Calendar periods run January–December; the current year and quarter may be incomplete. This does not show amounts owed or send payments. Payments are separate from Sales business expenses and sales labour costs.</p>
    <label className="mt-3 block text-sm font-semibold">Payment snapshot year
      <input type="number" min="1" max="9999" step="1" value={year} onChange={event => setYear(event.target.value)}
        className="ml-2 min-h-11 w-28 rounded-lg border border-mustard/50 bg-white px-3 py-2" />
    </label>
    {!isSnapshotYear(year) ? <p className="mt-3 text-sm">Enter a four-digit payment year.</p>
      : yearError?.year === year ? <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{yearError.message} Use Refresh payments to retry.</p>
        : cards ? <FinancialPeriodCards cards={cards} />
          : <p role="status" className="mt-3 text-sm">Loading yearly and quarterly payments…</p>}
    <h3 className="mt-5 font-heading text-lg font-bold">Monthly payment details</h3>
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="text-sm font-semibold">Payment month
        <input type="month" value={month} onChange={event => setMonth(event.target.value)}
          className="mt-1 block min-h-11 rounded-lg border border-mustard/50 bg-white px-3 py-2" />
      </label>
      <button type="button" disabled={loading} onClick={() => setRetry(value => value + 1)}
        className="min-h-11 rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold disabled:opacity-50">Refresh payments</button>
    </div>
    {!month && <p role="status" className="mt-3 text-sm">Choose a payment month.</p>}
    {loading && <p role="status" className="mt-3 text-sm">Loading artisan payments…</p>}
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {month && !loading && rows && <>
      <p className="mt-4 font-semibold">Total paid: {currency.format((totalPaise ?? 0) / 100)} · {rows.length} artisan{rows.length === 1 ? '' : 's'}</p>
      {rows.length === 0 ? <p className="mt-2 text-sm">No payments recorded for this month.</p> :
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">{rows.map(row =>
          <li key={row.artisanId}>
            <button type="button" aria-label={`View payments for ${row.name}`} onClick={() => setSelected(row)}
              className="h-full w-full rounded-xl border border-mustard/40 p-3 text-left hover:bg-cream/70">
              <span className="block break-words font-semibold">{row.name}</span>
              <span className="block font-heading text-xl font-bold">{currency.format(row.amount)}</span>
              <span className="block text-sm">{row.count} payment{row.count === 1 ? '' : 's'} · Latest: {formatDate(row.latestDate)}</span>
              <span className="mt-1 inline-block text-sm underline">View payment details</span>
            </button>
          </li>)}</ul>}
      <p className="mt-3 text-xs">Select an artisan to view individual payment entries.</p>
    </>}
    </div>
    {selected && <PaymentDetails artisan={selected} month={month} onClose={() => setSelected(null)} />}
  </section>;
}
