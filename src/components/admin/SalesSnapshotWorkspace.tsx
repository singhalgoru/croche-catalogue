import { useCallback, useEffect, useState } from 'react';
import { fetchSellerSales, type SellerSale } from '../../services/sellerSales';
import { fetchBusinessExpenses, type BusinessExpense } from '../../services/businessExpenses';
import SalesPeriodSnapshot from './SalesPeriodSnapshot';

export default function SalesSnapshotWorkspace({ refreshKey }: { refreshKey: number }) {
  const [sales, setSales] = useState<SellerSale[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setAvailable(false);
    setError(null);
    try {
      const [loadedSales, loadedExpenses] = await Promise.all([
        fetchSellerSales(), fetchBusinessExpenses(),
      ]);
      setSales(loadedSales);
      setExpenses(loadedExpenses);
      setAvailable(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to load sales snapshots.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (refreshKey > 0) queueMicrotask(() => void load());
  }, [refreshKey, load]);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl font-bold text-cocoa">Sales snapshots</h2>
        <button type="button" disabled={loading} onClick={() => void load()}
          className="rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-50">
          {loading ? 'Loading snapshots…' : 'Refresh snapshots'}
        </button>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <SalesPeriodSnapshot sales={sales} expenses={expenses} available={available} initiallyExpanded />
    </div>
  );
}
