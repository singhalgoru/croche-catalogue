import { useId, useMemo, useState } from 'react';
import type { SellerSale } from '../../services/sellerSales';
import type { BusinessExpense } from '../../services/businessExpenses';
import { formatINR } from '../../utils/currency';
import MarginLabel from './MarginLabel';
import { CALENDAR_QUARTERS, summarizeSalesPeriod } from './salesPeriodSummary';

interface Props {
  sales: SellerSale[];
  expenses: BusinessExpense[];
  available: boolean;
  initiallyExpanded?: boolean;
}

export default function SalesPeriodSnapshot({ sales, expenses, available, initiallyExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const panelId = useId();
  const years = useMemo(() => [...new Set([
    String(new Date().getFullYear()), year,
    ...sales.map(sale => sale.saleDate.slice(0, 4)),
    ...expenses.map(expense => expense.expenseDate.slice(0, 4)),
  ])].sort((a, b) => Number(b) - Number(a)), [sales, expenses, year]);
  const periods = useMemo(() => [
    { label: `Year ${year} · Jan–Dec`, totals: summarizeSalesPeriod(sales, expenses, year) },
    ...CALENDAR_QUARTERS.map(quarter => ({
      label: `${quarter.label} ${year}`,
      totals: summarizeSalesPeriod(sales, expenses, year, quarter.startMonth, quarter.endMonth),
    })),
  ], [sales, expenses, year]);

  return (
    <section aria-label="Quarterly and yearly sales snapshot" className="mt-5 rounded-2xl border border-mustard/40 bg-white p-4">
      <button type="button" aria-expanded={expanded} aria-controls={panelId}
        onClick={() => setExpanded(current => !current)}
        className="flex w-full items-center justify-between gap-3 text-left font-heading text-xl font-bold text-cocoa">
        <span>Quarterly &amp; yearly snapshot</span>
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      <div id={panelId} hidden={!expanded}>
        {expanded && <>
        <p className="mt-2 text-xs text-cocoa/65">
          Calendar year (January–December), not the April–March financial year.
          Based on recorded sale and expense dates; the current year and quarter may be incomplete.
          The monthly filter and sales CSV are unchanged.
        </p>
        <label className="mt-3 block text-sm font-semibold text-cocoa">
          Snapshot year
          <select aria-label="Snapshot year" value={year} onChange={event => setYear(event.target.value)}
            className="ml-2 rounded-lg border border-mustard/50 bg-white px-3 py-2">
            {years.map(option => <option key={option}>{option}</option>)}
          </select>
        </label>
        {!available ? (
          <p role="status" className="mt-3 text-sm text-cocoa/65">
            Snapshot unavailable or loading. Refresh to retry if loading failed.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {periods.map(({ label, totals }, index) => (
              <article key={label} aria-label={label}
                className={`min-w-0 rounded-2xl border border-mustard/40 p-4 ${index === 0 ? 'bg-cream/70 sm:col-span-2' : 'bg-white'}`}>
                <h4 className="font-heading text-lg font-bold text-cocoa">{label}</h4>
                <dl className="mt-3 grid gap-3 lg:grid-cols-2">
                  {([
                    ['Estimated sales profit', 'Margin before business expenses', totals.profit, totals.marginPercent],
                    ['Profit after business expenses', 'Margin after business expenses', totals.profitAfterOverheads, totals.marginAfterOverheads],
                  ] as const).map(([name, marginLabel, profit, margin]) => (
                    <div key={name} className={`min-w-0 rounded-xl border p-4 ${
                      profit < 0 ? 'border-red-200 bg-red-50' : 'border-mustard/40 bg-white'
                    }`}>
                      <dt className="text-sm font-semibold text-cocoa">{name}</dt>
                      <dd className={`mt-1 break-words font-heading text-3xl font-bold ${
                        profit < 0 ? 'text-red-800' : 'text-cocoa'
                      }`}>{formatINR(profit)}</dd>
                      <dd className="mt-3">
                        <MarginLabel margin={margin} className="inline-block max-w-full break-words text-xs font-semibold">
                          {marginLabel}: {margin === null ? '—' : `${margin.toFixed(1)}%`}
                        </MarginLabel>
                      </dd>
                    </div>
                  ))}
                </dl>
                <h5 className="mt-5 text-xs font-bold uppercase tracking-wide text-cocoa/65">Revenue &amp; cost breakdown</h5>
                <dl className={`mt-2 grid grid-cols-2 gap-3 text-sm text-cocoa ${index === 0 ? 'lg:grid-cols-4' : ''}`}>
                  {[
                    ['Sales revenue', formatINR(totals.revenue)],
                    ['Sales / pieces', `${totals.salesCount} / ${totals.piecesSold}`],
                    ['GST collected', formatINR(totals.gst)],
                    ['Material cost', formatINR(totals.materialCost)],
                    ['Labour cost', formatINR(totals.labourCost)],
                    ['Shipping cost', formatINR(totals.shippingCost)],
                    ['Business expenses', formatINR(totals.overheads)],
                  ].map(([name, value]) => (
                    <div key={name} className="min-w-0">
                      <dt className="text-xs text-cocoa/65">{name}</dt>
                      <dd className="break-words font-bold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-cocoa/65">
          Revenue includes GST. Profit subtracts included GST, sale costs, fees and recorded overheads.
          Material and labour costs include all pieces sold; shipping cost is recorded once per sale.
          Both margins use total revenue before GST, not an average of individual margins.
          Sales profit is before business expenses; the after-expenses figure deducts recorded overheads.
        </p>
        </>}
      </div>
    </section>
  );
}
