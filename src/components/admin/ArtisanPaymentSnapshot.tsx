import { useEffect, useId, useState } from 'react';
import { fetchArtisanActivity, fetchArtisanPaymentYear,
  type ArtisanPayment, type ArtisanPaymentMonth, type ArtisanPaymentSummary } from '../../services/artisanProfiles';
import { formatDate, localDate } from '../../utils/date';
import AdminDialog from './AdminDialog';
import FinancialPeriodCards from './FinancialPeriodCards';
import { calendarPeriods, isSnapshotYear } from './salesPeriodSummary';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

interface PaymentPeriod {
  label: string;
  year: string;
  startMonth: number;
  endMonth: number;
  artisans: ArtisanPaymentSummary[];
  expectedCount: number;
  expectedPaise: number;
}

function PaymentDetails({ period, onClose }: {
  period: PaymentPeriod; onClose: () => void;
}) {
  const [payments, setPayments] = useState<{ artisan: ArtisanPaymentSummary; payment: ArtisanPayment }[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setPayments(null);
      setError('');
      void Promise.all(period.artisans.map(async artisan => {
        const activity = await fetchArtisanActivity(artisan.artisanId);
        return activity.payments.filter(payment => {
          const month = Number(payment.paid_on.slice(5, 7));
          return payment.voided_at === null && payment.paid_on.startsWith(`${period.year}-`)
            && month >= period.startMonth && month <= period.endMonth;
        }).map(payment => ({ artisan, payment }));
      })).then(groups => {
        if (active) setPayments(groups.flat().sort((a, b) =>
          b.payment.paid_on.localeCompare(a.payment.paid_on)
          || a.artisan.name.localeCompare(b.artisan.name) || a.payment.id.localeCompare(b.payment.id)));
      }).catch(failure => {
        if (active) setError(failure instanceof Error ? failure.message : 'Unable to load payment details.');
      });
    });
    return () => { active = false; };
  }, [period, retry]);

  const changed = payments && (payments.length !== period.expectedCount
    || payments.reduce((sum, item) => sum + Math.round(item.payment.amount * 100), 0) !== period.expectedPaise);
  return <AdminDialog title={`Payments · ${period.label}`} onClose={onClose}>
    <div className="space-y-4 p-4">
      <p className="text-sm">Newest payments first; voided entries are excluded. To correct a payment or view private payout details, review the artisan in Admin → Artisans. Refresh the snapshot if payments have changed.</p>
      {error ? <div><p role="alert" className="text-red-700">{error}</p>
        <button type="button" className="min-h-11 underline" onClick={() => setRetry(value => value + 1)}>Retry payment details</button></div>
        : payments === null ? <p role="status">Loading payment details…</p>
          : <>{changed && <p role="status" className="text-sm">Payment details have changed since this snapshot. Refresh payments to update the totals.</p>}
            {payments.length === 0 ? <p>No recorded payments for this period.</p>
            : <ul className="space-y-3">{payments.map(({ artisan, payment }) =>
              <li key={payment.id} className="rounded-xl border border-mustard/40 bg-white p-3">
                <h3 className="break-words font-semibold">{formatDate(payment.paid_on)} · {artisan.name}</h3>
                <p className="font-heading text-lg font-bold">{currency.format(payment.amount)}</p>
                <p className="text-sm">Method: {payment.method}</p>
                {payment.reference && <p className="break-all text-sm">Transaction reference: {payment.reference}</p>}
                <p className="whitespace-pre-wrap break-words text-sm">Work / batch: {payment.description}</p>
              </li>)}</ul>}</>}
    </div>
  </AdminDialog>;
}

export default function ArtisanPaymentSnapshot({ refreshKey }: { refreshKey: number }) {
  const [expanded, setExpanded] = useState(false);
  const [year, setYear] = useState(() => localDate().slice(0, 4));
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<PaymentPeriod | null>(null);
  const [yearRows, setYearRows] = useState<{ year: string; data: ArtisanPaymentMonth[] } | null>(null);
  const [yearError, setYearError] = useState<{ year: string; message: string } | null>(null);
  const panelId = useId();

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

  const cards = yearRows?.year === year && isSnapshotYear(year) ? calendarPeriods(year).map(period => {
    const payments = yearRows.data.filter(item => {
      const monthNumber = Number(item.month.slice(5, 7));
      return monthNumber >= period.startMonth && monthNumber <= period.endMonth;
    }).flatMap(item => item.payments);
    const paid = payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
    const count = payments.reduce((sum, payment) => sum + payment.count, 0);
    const artisans = [...new Map(payments.map(payment => [payment.artisanId, payment])).values()];
    return { label: period.label, action: {
      label: `View payments for ${period.label}`,
      onClick: () => setSelected({ ...period, year, artisans, expectedCount: count, expectedPaise: paid }),
    }, metrics: [
      { label: 'Total paid', value: currency.format(paid / 100) },
      { label: 'Payments', value: String(count) },
      { label: 'Artisans', value: String(artisans.length) },
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
    <button type="button" onClick={() => setRetry(value => value + 1)}
      className="mt-3 min-h-11 rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold">Refresh payments</button>
    </div>
    {selected && <PaymentDetails period={selected} onClose={() => setSelected(null)} />}
  </section>;
}
