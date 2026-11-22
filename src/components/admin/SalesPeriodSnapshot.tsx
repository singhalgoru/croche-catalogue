import { useId, useMemo, useState } from 'react';
import type { SellerSale } from '../../services/sellerSales';
import type { BusinessExpense } from '../../services/businessExpenses';
import { formatINR } from '../../utils/currency';
import AdminDialog from './AdminDialog';
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
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
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
    <section aria-label="Sales snapshot" className="mt-5 rounded-2xl border border-mustard/40 bg-white p-4">
      <button type="button" aria-expanded={expanded} aria-controls={panelId}
        onClick={() => setExpanded(current => !current)}
        className="flex w-full items-center justify-between gap-3 text-left font-heading text-xl font-bold text-cocoa">
        <span>Sales snapshot</span>
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
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  {([
                    ['Estimated sales profit', 'Margin before business expenses', totals.profitAfterAllocations, totals.marginAfterAllocations],
                    ['Profit after business expenses', 'Margin after business expenses', totals.profitAfterOverheads, totals.marginAfterOverheads],
                  ] as const).map(([name, marginLabel, profit, margin]) => (
                    <div key={name} className="min-w-0">
                      <dt className="text-xs font-semibold text-cocoa">{name}</dt>
                      <dd className={`mt-1 break-words font-heading text-xl font-bold ${
                        profit < 0 ? 'text-red-800' : 'text-cocoa'
                      }`}>{formatINR(profit)}</dd>
                      <dd className="mt-1">
                        <MarginLabel margin={margin} className="inline-block max-w-full break-words text-xs font-semibold">
                          {marginLabel}: {margin === null ? '—' : `${margin.toFixed(1)}%`}
                        </MarginLabel>
                      </dd>
                    </div>
                  ))}
                </dl>
                <button type="button" onClick={() => setSelectedPeriod(index)}
                  className="mt-3 min-h-11 text-sm font-semibold underline underline-offset-4">
                  View breakdown for {label}
                </button>
              </article>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-cocoa/65">
          Revenue includes GST. Estimated sales profit subtracts included GST, sale costs, fees and saved planning allocations.
          Both margins use total revenue before GST, not an average of individual margins.
          Profit after business expenses uses profit before allocations minus recorded expenses, without deducting planning allowances again.
        </p>
        </>}
      </div>
      {available && expanded && selectedPeriod !== null && <AdminDialog
        title={`Sales breakdown · ${periods[selectedPeriod].label}`} onClose={() => setSelectedPeriod(null)}>
        {(() => {
          const { totals } = periods[selectedPeriod];
          return <div className="space-y-5 p-4 text-sm">
                <section aria-label="Revenue and costs">
                  <h3 className="font-heading text-lg font-bold">Revenue &amp; costs</h3>
                  <dl className="mt-2 grid grid-cols-2 gap-3 text-cocoa sm:grid-cols-3">
                  {[
                    ['Sales revenue', formatINR(totals.revenue)],
                    ['Sales / pieces', `${totals.salesCount} / ${totals.piecesSold}`],
                    ['GST collected', formatINR(totals.gst)],
                    ['Material cost', formatINR(totals.materialCost)],
                    ['Labour cost', formatINR(totals.labourCost)],
                    ['Packaging cost', formatINR(totals.packagingCost)],
                    ['Shipping cost', formatINR(totals.shippingCost)],
                    ['Payment fees', formatINR(totals.gatewayFee)],
                    ['Planning allocations', formatINR(totals.allocations)],
                    ['Profit before allocations', formatINR(totals.profit)],
                    ['Business expenses', formatINR(totals.overheads)],
                  ].map(([name, value]) => (
                    <div key={name} className="min-w-0">
                      <dt className="text-xs text-cocoa/65">{name}</dt>
                      <dd className="break-words font-bold">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-cocoa/65">Material, labour and packaging costs include all pieces sold; shipping cost is recorded once per sale.</p>
                </section>
                <section aria-label="Planning allocations">
                  <h3 className="font-heading text-lg font-bold">Planning allocations</h3>
                  <p className="mt-1 text-xs text-cocoa/65">Estimated allowances from saved sale rates, not actual expenses.</p>
                  <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {([
                      ['Marketing allocation', totals.marketingAllocation],
                      ['Returns / damage allocation', totals.returnsAllocation],
                      ['Overhead allocation', totals.overheadAllocation],
                    ] as const).map(([name, value]) => <div key={name} className="min-w-0">
                      <dt className="text-xs text-cocoa/65">{name}</dt>
                      <dd className="break-words font-bold">{formatINR(value)}</dd>
                    </div>)}
                  </dl>
                </section>
                <section aria-label="Recorded business expenses">
                  <h3 className="font-heading text-lg font-bold">Recorded business expenses</h3>
                  <p className="mt-1 text-xs text-cocoa/65">Actual expenses by category, separate from planning allocations.</p>
                  <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {totals.expensesByCategory.map(({ category, amount }) => <div key={category} className="min-w-0">
                      <dt className="text-xs text-cocoa/65">{category}</dt>
                      <dd className="break-words font-bold">{formatINR(amount)}</dd>
                    </div>)}
                  </dl>
                </section>
              </div>;
        })()}
      </AdminDialog>}
    </section>
  );
}
