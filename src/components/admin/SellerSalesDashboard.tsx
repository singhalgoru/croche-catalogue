import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  createSellerSale,
  deleteSellerSale,
  fetchSellerSales,
  SALE_CHANNELS,
  updateSellerSale,
  type SaleChannel,
  type SellerSale,
  type SellerSaleInput,
} from '../../services/sellerSales';
import { fetchManagedProducts, type ManagedProduct } from '../../services/products';
import { formatINR } from '../../utils/currency';
import { getPublicVariantPrice } from '../../utils/productPrice';
import { calculateSaleFinancials, summarizeSellerSales } from './sellerSalesSummary';
import { buildSellerSalesCsv, parseSellerSalesCsv } from './sellerSalesReport';

interface Props {
  refreshKey: number;
}

interface SaleDraft {
  productId: string;
  productName: string;
  variantName: string;
  saleDate: string;
  channel: SaleChannel;
  quantity: string;
  unitPrice: string;
  gstPercent: string;
  materialCost: string;
  labourCost: string;
  packagingCost: string;
  shippingCost: string;
  gatewayFeePercent: string;
  gatewayFeeGstPercent: string;
  notes: string;
}

const localDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const currentMonth = () => localDate().slice(0, 7);

const blankDraft = (): SaleDraft => ({
  productId: '',
  productName: '',
  variantName: '',
  saleDate: localDate(),
  channel: 'offline',
  quantity: '1',
  unitPrice: '',
  gstPercent: '5',
  materialCost: '',
  labourCost: '',
  packagingCost: '',
  shippingCost: '',
  gatewayFeePercent: '0',
  gatewayFeeGstPercent: '18',
  notes: '',
});

const saleToDraft = (sale: SellerSale): SaleDraft => ({
  productId: sale.productId ?? '',
  productName: sale.productName,
  variantName: sale.variantName,
  saleDate: sale.saleDate,
  channel: sale.channel,
  quantity: String(sale.quantity),
  unitPrice: String(sale.unitPrice),
  gstPercent: String(sale.gstPercent),
  materialCost: String(sale.materialCost),
  labourCost: String(sale.labourCost),
  packagingCost: String(sale.packagingCost),
  shippingCost: String(sale.shippingCost),
  gatewayFeePercent: String(sale.gatewayFeePercent),
  gatewayFeeGstPercent: String(sale.gatewayFeeGstPercent),
  notes: sale.notes,
});

const parseAmount = (value: string, label: string) => {
  const amount = Number(value);
  if (value.trim() === '' || !Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return amount;
};

const toSaleInput = (draft: SaleDraft): SellerSaleInput => {
  const quantity = Number(draft.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
    throw new Error('Quantity must be a whole number between 1 and 100,000.');
  }
  return {
    productId: draft.productId || null,
    productName: draft.productName.trim(),
    variantName: draft.variantName,
    saleDate: draft.saleDate,
    channel: draft.channel,
    quantity,
    unitPrice: parseAmount(draft.unitPrice, 'Selling price'),
    gstPercent: parseAmount(draft.gstPercent, 'GST rate'),
    materialCost: parseAmount(draft.materialCost, 'Material cost per piece'),
    labourCost: parseAmount(draft.labourCost, 'Labour cost per piece'),
    packagingCost: parseAmount(draft.packagingCost, 'Packaging cost per piece'),
    shippingCost: parseAmount(draft.shippingCost, 'Shipping cost for this sale'),
    gatewayFeePercent: parseAmount(draft.gatewayFeePercent, 'Payment fee rate'),
    gatewayFeeGstPercent: parseAmount(draft.gatewayFeeGstPercent, 'GST on payment fee'),
    notes: draft.notes,
  };
};

const channelLabel = (channel: SaleChannel) => ({
  online: 'Online',
  offline: 'Offline / cash',
  whatsapp: 'WhatsApp / UPI',
  instagram: 'Instagram / social',
  other: 'Other',
})[channel];

const formatMargin = (margin: number | null) =>
  margin === null ? '—' : `${margin.toFixed(1)}%`;

export default function SellerSalesDashboard({ refreshKey }: Props) {
  const [sales, setSales] = useState<SellerSale[]>([]);
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [month, setMonth] = useState(currentMonth);
  const [draft, setDraft] = useState<SaleDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const reportFileInput = useRef<HTMLInputElement>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const [loadedSales, loadedProducts] = await Promise.all([
        fetchSellerSales(),
        fetchManagedProducts(),
      ]);
      setSales(loadedSales);
      setProducts(loadedProducts);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the sales dashboard.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadDashboard());
  }, [loadDashboard, refreshKey]);

  const monthSales = useMemo(
    () => sales.filter((sale) => sale.saleDate.startsWith(`${month}-`)),
    [month, sales],
  );
  const summary = useMemo(() => summarizeSellerSales(monthSales), [monthSales]);
  const salesByChannel = useMemo(
    () => SALE_CHANNELS.map((channel) => ({
      channel,
      count: monthSales.filter((sale) => sale.channel === channel).length,
    })),
    [monthSales],
  );

  const updateDraft = (patch: Partial<SaleDraft>) =>
    setDraft((current) => current ? { ...current, ...patch } : current);

  const selectProduct = (productId: string) => {
    const selectedProduct = products.find((product) => product.id === productId);
    if (!selectedProduct) {
      updateDraft({
        productId: '',
        productName: '',
        variantName: '',
        unitPrice: '',
        gstPercent: '5',
        materialCost: '',
        labourCost: '',
        packagingCost: '',
        shippingCost: '',
      });
      return;
    }
    const priceInputs = selectedProduct.priceDiscoveryInputs;
    const selectedVariant = selectedProduct.variants[0];
    const timeSpent = Number(priceInputs?.timeSpent ?? 0);
    const labourRate = 100;
    const labourCost = Number.isFinite(timeSpent)
      ? (priceInputs?.timeUnit === 'minutes' ? timeSpent / 60 : timeSpent) * labourRate
      : 0;
    updateDraft({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      variantName: selectedVariant?.name ?? '',
      unitPrice: selectedVariant
        ? String(getPublicVariantPrice(selectedProduct, selectedVariant) ?? '')
        : String(selectedProduct.price ?? ''),
      gstPercent: String(
        selectedProduct.gstPercent ?? priceInputs?.gstPercent ?? 5,
      ),
      materialCost: priceInputs?.materialCost ?? '',
      labourCost: priceInputs ? String(labourCost) : '',
      packagingCost: priceInputs?.packagingCost ?? '',
      shippingCost: priceInputs?.shippingCost ?? '',
    });
  };

  const selectVariant = (product: ManagedProduct, variantId: string) => {
    const variant = product.variants.find((item) => item.id === variantId);
    if (!variant) return;
    updateDraft({
      variantName: product.variants.length > 1 ? variant.name : '',
      unitPrice: String(getPublicVariantPrice(product, variant) ?? ''),
    });
  };

  const saveSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const input = toSaleInput(draft);
      const saved = editingId
        ? await updateSellerSale(editingId, input)
        : await createSellerSale(input);
      setSales((current) => [
        saved,
        ...current.filter((sale) => sale.id !== saved.id),
      ].sort((left, right) => right.saleDate.localeCompare(left.saleDate)));
      setDraft(null);
      setEditingId(null);
      setMessage(editingId ? 'Sale updated.' : 'Sale recorded.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save this sale.');
    } finally {
      setBusy(false);
    }
  };

  const removeSale = async (sale: SellerSale) => {
    setBusy(true);
    setError(null);
    try {
      await deleteSellerSale(sale.id);
      setSales((current) => current.filter((item) => item.id !== sale.id));
      setDeleteId(null);
      setMessage('Sale deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete this sale.');
    } finally {
      setBusy(false);
    }
  };

  const downloadReport = () => {
    const blob = new Blob(
      [`\uFEFF${buildSellerSalesCsv(month, monthSales)}`],
      { type: 'text/csv;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `luvia-sales-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importReport = async (file: File) => {
    setIsImporting(true);
    setError(null);
    setMessage(null);
    let savedCount = 0;
    try {
      if (!file.name.toLocaleLowerCase().endsWith('.csv')) {
        throw new Error('Upload an Excel-compatible CSV file. Download the monthly report to get the required template.');
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('The sales CSV must be smaller than 5 MB.');
      }
      const parsed = parseSellerSalesCsv(
        await file.text(),
        month,
        new Set(products.map((product) => product.id)),
      );
      for (let index = 0; index < parsed.sales.length; index += 1) {
        const saleId = parsed.existingIds[index];
        if (saleId && sales.some((existing) => existing.id === saleId)) {
          await updateSellerSale(saleId, parsed.sales[index]);
        } else {
          await createSellerSale(parsed.sales[index]);
        }
        savedCount += 1;
      }
      await loadDashboard();
      setMessage(`Imported ${savedCount} sale${savedCount === 1 ? '' : 's'} for ${month}. Rows with existing record IDs were updated.`);
    } catch (importError) {
      const reason = importError instanceof Error
        ? importError.message
        : 'Unable to import the sales report.';
      setError(
        savedCount > 0
          ? `${reason} ${savedCount} earlier row${savedCount === 1 ? ' was' : 's were'} already saved; refresh to verify.`
          : reason,
      );
      await loadDashboard();
    } finally {
      setIsImporting(false);
      if (reportFileInput.current) reportFileInput.current.value = '';
    }
  };

  return (
    <section className="mb-8 rounded-2xl border border-mustard/40 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-mustard-dark">
            Seller tools
          </p>
          <h2 className="font-heading text-2xl font-bold text-cocoa sm:text-3xl">
            Sales dashboard
          </h2>
          <p className="mt-1 text-sm text-cocoa/65">
            Track monthly sales by product and channel. Profit is an estimate using each sale&apos;s saved cost and GST values.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-semibold text-cocoa">
            Month
            <input
              aria-label="Sales month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value || currentMonth())}
              className="ml-2 rounded-lg border border-mustard/50 px-2 py-2"
            />
          </label>
          <button
            type="button"
            onClick={downloadReport}
            className="rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold text-cocoa"
          >
            Download Excel CSV
          </button>
          <button
            type="button"
            onClick={() => reportFileInput.current?.click()}
            disabled={isImporting || isLoading}
            className="rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-50"
          >
            {isImporting ? 'Importing…' : 'Upload CSV'}
          </button>
          <input
            ref={reportFileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            aria-label="Upload monthly sales CSV"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void importReport(file);
            }}
          />
          <button
            type="button"
            onClick={() => {
              setDraft(blankDraft());
              setEditingId(null);
              setError(null);
              setMessage(null);
            }}
            className="self-end rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream"
          >
            Record sale
          </button>
        </div>
        <p className="mt-2 text-xs text-cocoa/55">
          Download an Excel-compatible CSV for the selected month. You can edit it in Excel and upload it again; matching record IDs update existing sales.
        </p>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>}

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Sales revenue', formatINR(summary.revenue), 'GST-inclusive'],
          ['Estimated net profit', formatINR(summary.profit), 'After GST, fees and costs'],
          ['Profit margin', formatMargin(summary.marginPercent), 'On revenue before GST'],
          ['Sales / pieces', `${summary.salesCount} / ${summary.piecesSold}`, 'Transactions / units'],
          ['GST collected', formatINR(summary.gst), 'Calculated from recorded GST rate'],
        ].map(([label, value, description]) => (
          <article key={label} className="rounded-xl bg-cream/70 p-3">
            <p className="text-xs font-semibold text-cocoa/60">{label}</p>
            <p className="mt-1 font-heading text-xl font-bold text-cocoa">{value}</p>
            <p className="mt-1 text-xs text-cocoa/55">{description}</p>
          </article>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cocoa/65">
        <span className="font-semibold">Sales by channel:</span>
        {salesByChannel.map(({ channel, count }) => (
          <span key={channel}>{channelLabel(channel)}: {count}</span>
        ))}
      </div>

      {draft && (
        <form onSubmit={(event) => void saveSale(event)} className="mt-5 rounded-2xl border border-mustard/40 bg-cream/35 p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-heading text-xl font-bold text-cocoa">
              {editingId ? 'Edit sale' : 'Record a sale'}
            </h3>
            <button
              type="button"
              onClick={() => { setDraft(null); setEditingId(null); }}
              className="rounded-full border border-cocoa/20 px-3 py-1 text-sm font-semibold text-cocoa"
            >
              Cancel
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-semibold text-cocoa">
              Product
              <select
                aria-label="Sale product"
                value={draft.productId}
                onChange={(event) => selectProduct(event.target.value)}
                className="mt-1 w-full rounded-lg border border-mustard/60 bg-white px-3 py-2"
              >
                <option value="">Custom / unlisted item</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-cocoa">
              Product name
              <input
                aria-label="Sale product name"
                value={draft.productName}
                onChange={(event) => updateDraft({ productName: event.target.value })}
                maxLength={150}
                required
                className="mt-1 w-full rounded-lg border border-mustard/60 bg-white px-3 py-2"
              />
            </label>
            {draft.productId && (products.find((product) => product.id === draft.productId)?.variants.length ?? 0) > 1 && (
              <label className="text-sm font-semibold text-cocoa">
                Variant
                <select
                  aria-label="Sale variant"
                  value={products.find((product) => product.id === draft.productId)?.variants.find((variant) => variant.name === draft.variantName)?.id ?? ''}
                  onChange={(event) => {
                    const product = products.find((item) => item.id === draft.productId);
                    if (product) selectVariant(product, event.target.value);
                  }}
                  className="mt-1 w-full rounded-lg border border-mustard/60 bg-white px-3 py-2"
                >
                  {products.find((product) => product.id === draft.productId)?.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>{variant.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-sm font-semibold text-cocoa">
              Sale date
              <input
                aria-label="Sale date"
                type="date"
                value={draft.saleDate}
                onChange={(event) => updateDraft({ saleDate: event.target.value })}
                required
                className="mt-1 w-full rounded-lg border border-mustard/60 bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm font-semibold text-cocoa">
              Sales channel
              <select
                aria-label="Sales channel"
                value={draft.channel}
                onChange={(event) => {
                  const channel = event.target.value as SaleChannel;
                  updateDraft({
                    channel,
                    gatewayFeePercent: channel === 'online' ? '2' : '0',
                  });
                }}
                className="mt-1 w-full rounded-lg border border-mustard/60 bg-white px-3 py-2"
              >
                {SALE_CHANNELS.map((channel) => <option key={channel} value={channel}>{channelLabel(channel)}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-cocoa">
              Quantity
              <input
                aria-label="Sale quantity"
                type="number"
                min={1}
                step={1}
                value={draft.quantity}
                onChange={(event) => updateDraft({ quantity: event.target.value })}
                required
                className="mt-1 w-full rounded-lg border border-mustard/60 bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm font-semibold text-cocoa">
              Unit selling price (₹, incl. GST)
              <input
                aria-label="Unit selling price"
                type="number"
                min="0.01"
                step="0.01"
                value={draft.unitPrice}
                onChange={(event) => updateDraft({ unitPrice: event.target.value })}
                required
                className="mt-1 w-full rounded-lg border border-mustard/60 bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm font-semibold text-cocoa">
              GST (%)
              <input
                aria-label="Sale GST rate"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={draft.gstPercent}
                onChange={(event) => updateDraft({ gstPercent: event.target.value })}
                required
                className="mt-1 w-full rounded-lg border border-mustard/60 bg-white px-3 py-2"
              />
            </label>
            {([
              ['materialCost', 'Materials per piece (₹)'],
              ['labourCost', 'Labour per piece (₹)'],
              ['packagingCost', 'Packaging per piece (₹)'],
              ['shippingCost', 'Shipping cost for this sale (₹)'],
              ['gatewayFeePercent', 'Payment processing fee (%)'],
              ['gatewayFeeGstPercent', 'GST on payment fee (%)'],
            ] as const).map(([field, label]) => (
              <label key={field} className="text-sm font-semibold text-cocoa">
                {label}
                <input
                  aria-label={label}
                  type="number"
                  min={0}
                  max={1000000}
                  step="0.01"
                  value={draft[field]}
                  onChange={(event) => updateDraft({ [field]: event.target.value })}
                  required
                  className="mt-1 w-full rounded-lg border border-mustard/60 bg-white px-3 py-2"
                />
              </label>
            ))}
            <label className="text-sm font-semibold text-cocoa sm:col-span-2 lg:col-span-3">
              Notes (optional)
              <textarea
                aria-label="Sale notes"
                value={draft.notes}
                onChange={(event) => updateDraft({ notes: event.target.value })}
                maxLength={1000}
                rows={2}
                className="mt-1 w-full rounded-lg border border-mustard/60 bg-white px-3 py-2"
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-cocoa/65">
            Product price and saved GST/cost values are prefilled when available and can be changed for this sale. Material, labour and packaging are per piece; shipping is one cost for this sale. Labour defaults to the price calculator&apos;s ₹100/hour rate. Online payment fees default to 2%; all figures are editable.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="mt-4 rounded-full bg-cocoa px-5 py-2 font-semibold text-cream disabled:opacity-60"
          >
            {busy ? 'Saving…' : editingId ? 'Save sale changes' : 'Save sale'}
          </button>
        </form>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <h3 className="font-heading text-xl font-bold text-cocoa">
          Sales in {month}
        </h3>
        <button
          type="button"
          onClick={() => void loadDashboard()}
        disabled={isLoading || isImporting}
          className="rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-50"
        >
          {isLoading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-cocoa/60">Loading sales…</p>
      ) : monthSales.length === 0 ? (
        <p className="mt-3 rounded-xl bg-cream/60 p-4 text-sm text-cocoa/65">
          No sales recorded for this month. Record a sale to start tracking revenue and profit.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {monthSales.map((sale) => {
            const financials = calculateSaleFinancials(sale);
            const deleting = deleteId === sale.id;
            return (
              <article key={sale.id} className="rounded-xl border border-mustard/25 bg-white p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-cocoa">
                      {sale.productName}{sale.variantName ? ` · ${sale.variantName}` : ''}
                    </h4>
                    <p className="mt-1 text-xs text-cocoa/60">
                      {sale.saleDate} · {channelLabel(sale.channel)} · Qty {sale.quantity} · {formatINR(sale.unitPrice)} each
                    </p>
                    {sale.notes && <p className="mt-1 text-sm text-cocoa/70">{sale.notes}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(saleToDraft(sale));
                        setEditingId(sale.id);
                        setDeleteId(null);
                        setError(null);
                      }}
                      className="rounded-full border border-cocoa/25 px-3 py-1.5 text-xs font-semibold text-cocoa"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(deleting ? null : sale.id)}
                      className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700"
                    >
                      {deleting ? 'Cancel delete' : 'Delete'}
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-cocoa/10 pt-3 text-sm sm:grid-cols-4">
                  <p><span className="text-cocoa/60">Revenue</span><br /><strong>{formatINR(financials.revenue)}</strong></p>
                  <p><span className="text-cocoa/60">GST</span><br /><strong>{formatINR(financials.gst)}</strong></p>
                  <p><span className="text-cocoa/60">Costs + fees</span><br /><strong>{formatINR(financials.costs + financials.gatewayFee)}</strong></p>
                  <p><span className="text-cocoa/60">Est. profit · margin</span><br /><strong>{formatINR(financials.profit)} · {formatMargin(financials.marginPercent)}</strong></p>
                </div>
                {deleting && (
                  <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                    <p>Delete this sale record? Its amounts will be removed from your monthly totals.</p>
                    <button
                      type="button"
                      onClick={() => void removeSale(sale)}
                      disabled={busy}
                      className="mt-2 rounded-full bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-60"
                    >
                      {busy ? 'Deleting…' : 'Confirm delete'}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-cocoa/55">
        Estimates subtract GST included in the selling price, payment fees (plus GST on those fees), recorded product costs and shipping paid. Keep original invoices and verify actual tax obligations separately.
      </p>
    </section>
  );
}
