import { useId, useState } from 'react';
import type { ManagedProduct } from '../../services/products';
import {
  suggestProductGstRate,
  type ProductGstRateSuggestion,
} from '../../services/productAnalysis';
import {
  calculatePriceAtSellingPrice,
  calculateMinimumOrderQuantity,
  estimateProductPrice,
  roundPriceUp,
  type PriceDiscoveryDefaults,
  type PriceDiscoveryInputs,
} from './priceDiscovery';

interface Props {
  product: Pick<ManagedProduct, 'name' | 'category' | 'description' | 'materials' | 'includedItems'>;
  defaults: PriceDiscoveryDefaults;
  inputs: PriceDiscoveryInputs;
  onInputsChange: (inputs: PriceDiscoveryInputs) => void;
  onApplyPrice: (
    price: number,
    profitMarginPercent: number,
    gstPercent: number,
    minimumOrderQuantity: number | null,
  ) => void;
  onSaveInputs: (inputs: PriceDiscoveryInputs) => Promise<void>;
  isNewProduct?: boolean;
}

const formatRupees = (amount: number) =>
  `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.ceil(amount))}`;

export default function PriceDiscoveryPanel({
  product,
  defaults,
  inputs,
  onInputsChange,
  onApplyPrice,
  onSaveInputs,
  isNewProduct = false,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [roundingIncrement, setRoundingIncrement] = useState(5);
  const [hasSuggestedPrice, setHasSuggestedPrice] = useState(false);
  const [sellingPrice, setSellingPrice] = useState('');
  const [isSuggestingGst, setIsSuggestingGst] = useState(false);
  const [gstSuggestion, setGstSuggestion] = useState<ProductGstRateSuggestion | null>(null);
  const [gstSuggestionError, setGstSuggestionError] = useState<string | null>(null);
  const [isSavingInputs, setIsSavingInputs] = useState(false);
  const [saveInputsMessage, setSaveInputsMessage] = useState<string | null>(null);
  const [saveInputsError, setSaveInputsError] = useState<string | null>(null);
  const panelId = useId();
  const estimate = estimateProductPrice(inputs, defaults);
  const suggestedPrice = estimate
    ? roundPriceUp(estimate.suggestedCustomerPrice, roundingIncrement)
    : null;
  const priceOutcome = hasSuggestedPrice
    ? calculatePriceAtSellingPrice(inputs, defaults, sellingPrice)
    : null;
  const suggestedMinimumOrderQuantity = hasSuggestedPrice
    ? calculateMinimumOrderQuantity(inputs, defaults, sellingPrice)
    : null;

  const updateInput = (field: keyof PriceDiscoveryInputs, value: string) => {
    setHasSuggestedPrice(false);
    setSellingPrice('');
    setSaveInputsMessage(null);
    setSaveInputsError(null);
    onInputsChange({ ...inputs, [field]: value });
  };

  const suggestPrice = () => {
    if (suggestedPrice === null) return;
    setSellingPrice(String(suggestedPrice));
    setHasSuggestedPrice(true);
  };

  const saveInputs = async () => {
    setIsSavingInputs(true);
    setSaveInputsError(null);
    setSaveInputsMessage(null);
    try {
      await onSaveInputs(inputs);
      setSaveInputsMessage(isNewProduct
        ? 'Price discovery values saved in this draft. They will be stored with the product when published.'
        : 'Price discovery values saved for this product.');
    } catch (error) {
      setSaveInputsError(
        error instanceof Error ? error.message : 'Unable to save price discovery values.',
      );
    } finally {
      setIsSavingInputs(false);
    }
  };

  const getGstSuggestion = async () => {
    setIsSuggestingGst(true);
    setGstSuggestionError(null);
    setGstSuggestion(null);
    try {
      setGstSuggestion(await suggestProductGstRate({
        name: product.name,
        category: product.category,
        description: product.description,
        materials: product.materials ?? '',
        includedItems: product.includedItems ?? '',
      }));
    } catch (error) {
      setGstSuggestionError(
        error instanceof Error ? error.message : 'Unable to request a GST rate suggestion.',
      );
    } finally {
      setIsSuggestingGst(false);
    }
  };

  return (
    <section className="mt-4 rounded-xl border border-mustard/40 bg-white">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        onClick={() => setIsExpanded((open) => !open)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <span className="min-w-0">
          <span className="block font-semibold text-cocoa">Price discovery</span>
          <span className="block text-xs text-cocoa/60">
            {suggestedPrice === null
              ? 'Estimate costs and a selling price'
              : `Suggested ${formatRupees(suggestedPrice)} including GST`}
          </span>
        </span>
        <span aria-hidden="true" className="text-lg font-bold text-cocoa">
          {isExpanded ? '−' : '+'}
        </span>
      </button>
      {isExpanded && (
        <div id={panelId} className="space-y-4 border-t border-mustard/30 p-3">
          <p className="text-xs leading-relaxed text-cocoa/70">
            Search actual HSN and GST entries using the product details. Crochet alone does not decide
            classification; review the provider match, rate conditions, and CBIC notification before use.
            Nothing changes the live catalogue price until you apply and save it.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${panelId}-time`} className="text-sm font-semibold text-cocoa">
                Time spent
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id={`${panelId}-time`}
                  aria-label={`${product.name} time spent`}
                  type="number"
                  min="0"
                  step={inputs.timeUnit === 'hours' ? '0.25' : '1'}
                  value={inputs.timeSpent}
                  onChange={(event) => updateInput('timeSpent', event.target.value)}
                  placeholder={inputs.timeUnit === 'hours' ? 'e.g. 2.5' : 'e.g. 150'}
                  className="min-w-0 flex-1 rounded-lg border border-mustard/60 px-3 py-2"
                />
                <select
                  aria-label={`${product.name} time unit`}
                  value={inputs.timeUnit}
                  onChange={(event) => {
                    setHasSuggestedPrice(false);
                    setSellingPrice('');
                    onInputsChange({
                      ...inputs,
                      timeUnit: event.target.value === 'minutes' ? 'minutes' : 'hours',
                    });
                  }}
                  className="rounded-lg border border-mustard/60 bg-white px-3 py-2"
                >
                  <option value="hours">Hours</option>
                  <option value="minutes">Minutes</option>
                </select>
              </div>
            </div>
            <label className="text-sm font-semibold text-cocoa">
              Materials cost (₹)
              <input
                aria-label={`${product.name} materials cost`}
                type="number"
                min="0"
                step="1"
                value={inputs.materialCost}
                onChange={(event) => updateInput('materialCost', event.target.value)}
                placeholder="e.g. 80"
                className="mt-1 w-full rounded-lg border border-mustard/60 px-3 py-2"
              />
            </label>
            <label className="text-sm font-semibold text-cocoa">
              Shipping cost (₹)
              <input
                aria-label={`${product.name} shipping cost`}
                type="number"
                min="0"
                step="1"
                value={inputs.shippingCost}
                onChange={(event) => updateInput('shippingCost', event.target.value)}
                className="mt-1 w-full rounded-lg border border-mustard/60 px-3 py-2"
              />
              <span className="mt-1 block text-xs font-normal text-cocoa/60">
                Keep your actual shipping cost here. Margin estimates conservatively include it
                even though customers see indicative shipping below ₹500.
              </span>
            </label>
            <label className="text-sm font-semibold text-cocoa">
              Packaging cost (₹)
              <input
                aria-label={`${product.name} packaging cost`}
                type="number"
                min="0"
                step="1"
                value={inputs.packagingCost}
                onChange={(event) => updateInput('packagingCost', event.target.value)}
                className="mt-1 w-full rounded-lg border border-mustard/60 px-3 py-2"
              />
            </label>
            <label className="text-sm font-semibold text-cocoa">
              Target profit margin (%)
              <input
                aria-label={`${product.name} target profit margin`}
                type="number"
                min="0"
                max="95"
                step="0.5"
                value={inputs.targetMarginPercent}
                onChange={(event) => updateInput('targetMarginPercent', event.target.value)}
                className="mt-1 w-full rounded-lg border border-mustard/60 px-3 py-2"
              />
              <span className="mt-1 block text-xs font-normal text-cocoa/60">
                Set a product-specific margin. The calculation uses profit divided by the selling
                price before GST.
              </span>
            </label>
            <div className="sm:col-span-2">
              <label htmlFor={`${panelId}-gst`} className="text-sm font-semibold text-cocoa">
                GST rate for this product estimate (%)
              </label>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id={`${panelId}-gst`}
                  aria-label={`${product.name} GST rate for estimate`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={inputs.gstPercent}
                  onChange={(event) => updateInput('gstPercent', event.target.value)}
                  placeholder="Default estimate: 5%"
                  className="w-full rounded-lg border border-mustard/60 px-3 py-2 sm:max-w-xs"
                />
                <button
                  type="button"
                  onClick={() => void getGstSuggestion()}
                  disabled={isSuggestingGst}
                  className="min-h-11 self-start rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-60"
                >
                  {isSuggestingGst ? 'Getting GST rate & HSN…' : 'Get GST rate & HSN'}
                </button>
              </div>
              <p className="mt-1 text-xs text-cocoa/60">
                Each product starts with an editable 5% estimate. Confirm the correct rate for this
                product before relying on the price calculation; 5% is not an HSN classification.
              </p>
              {gstSuggestionError && (
                <p role="alert" className="mt-2 text-sm text-red-700">{gstSuggestionError}</p>
              )}
              {gstSuggestion && (
                <div className="mt-2 rounded-xl border border-mustard/50 bg-mustard/10 p-3">
                  <p className="text-xs text-cocoa/70">
                    {gstSuggestion.source}. Check the HSN description, product use and conditions before applying.
                  </p>
                  {gstSuggestion.message && (
                    <p role="status" className="mt-2 text-sm font-semibold text-cocoa">
                      {gstSuggestion.message}
                    </p>
                  )}
                  {gstSuggestion.candidates.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {gstSuggestion.candidates.map((candidate) => (
                        <article
                          key={`${candidate.hsnCode}:${candidate.hsnDescription}`}
                          className="rounded-lg border border-cocoa/10 bg-white p-3"
                        >
                          <p className="text-sm font-bold text-cocoa">
                            HSN {candidate.hsnCode} — {candidate.hsnDescription}
                          </p>
                          <p className="mt-1 text-sm text-cocoa">
                            GST total {candidate.gstRate}% · IGST {candidate.igstRate === null ? 'not supplied' : `${candidate.igstRate}%`}
                            {' '}· CGST {candidate.cgstRate === null ? 'not supplied' : `${candidate.cgstRate}%`}
                            {' '}+ SGST {candidate.sgstRate === null ? 'not supplied' : `${candidate.sgstRate}%`}
                            {candidate.cessRate > 0 ? ` · Cess ${candidate.cessRate}%` : ''}
                          </p>
                          <p className="mt-1 text-xs text-cocoa/70">
                            Match confidence {Math.round(candidate.confidence * 100)}%
                            {candidate.notificationRef ? ` · CBIC notification ${candidate.notificationRef}` : ''}
                            {candidate.needsReview ? ' · Review required' : ''}
                          </p>
                          {candidate.conditionApplied && (
                            <p className="mt-1 text-xs text-cocoa/75">Condition applied: {candidate.conditionApplied}</p>
                          )}
                          {candidate.conditionWarning && (
                            <p role="alert" className="mt-1 text-xs font-semibold text-red-800">
                              Rate condition: {candidate.conditionWarning}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => updateInput('gstPercent', String(candidate.gstRate))}
                            className="mt-2 min-h-10 rounded-full bg-mustard px-4 py-2 text-sm font-semibold text-cocoa"
                          >
                            Use {candidate.gstRate}% GST rate in estimate
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                  <a
                    href="https://www.gstaccelerator.in/docs"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs text-cocoa underline underline-offset-2"
                  >
                    GST Accelerator API documentation
                  </a>
                </div>
              )}
            </div>
          </div>

          {estimate && suggestedPrice !== null && !hasSuggestedPrice ? (
            <div className="rounded-xl bg-cream p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <span className="text-cocoa/70">Labour ({formatRupees(defaults.labourRate)}/hour)</span>
                <span className="text-right font-medium text-cocoa">{formatRupees(estimate.labourCost)}</span>
                <span className="text-cocoa/70">Total cost basis</span>
                <span className="text-right font-medium text-cocoa">{formatRupees(estimate.totalCost)}</span>
                <span className="text-cocoa/70">Target profit margin</span>
                <span className="text-right font-medium text-cocoa">
                  {Number(inputs.targetMarginPercent).toFixed(1)}%
                </span>
              </div>
              <div className="mt-4 flex flex-col gap-3 border-t border-cocoa/10 pt-3 sm:flex-row sm:items-end sm:justify-between">
                <label className="text-xs font-semibold text-cocoa">
                  Round up to nearest
                  <select
                    aria-label={`${product.name} price rounding`}
                    value={roundingIncrement}
                    onChange={(event) => setRoundingIncrement(Number(event.target.value))}
                    className="ml-2 rounded-lg border border-mustard/60 bg-white px-2 py-2 text-sm"
                  >
                    <option value={1} disabled>₹1</option>
                    <option value={5}>₹5</option>
                    <option value={10}>₹10</option>
                    <option value={50}>₹50</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={suggestPrice}
                  className="min-h-11 rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream"
                >
                  Suggest price
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-cocoa/10 pt-3">
                <button
                  type="button"
                  disabled={isSavingInputs}
                  onClick={() => void saveInputs()}
                  className="min-h-10 rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-60"
                >
                  {isSavingInputs ? 'Saving values…' : isNewProduct ? 'Save values in draft' : 'Save values for this product'}
                </button>
                {saveInputsMessage && <span role="status" className="text-sm text-green-800">{saveInputsMessage}</span>}
                {saveInputsError && <span role="alert" className="text-sm text-red-700">{saveInputsError}</span>}
              </div>
            </div>
          ) : estimate && suggestedPrice !== null && hasSuggestedPrice ? (
            <div className="rounded-xl bg-cream p-3 sm:p-4">
              <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
                <label className="text-sm font-semibold text-cocoa">
                  Customer price including GST (₹)
                  <input
                    aria-label={`${product.name} customer price including GST`}
                    type="number"
                    min="1"
                    step="1"
                    value={sellingPrice}
                    onChange={(event) => setSellingPrice(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-mustard/60 bg-white px-3 py-2"
                  />
                </label>
                <div className="flex flex-col gap-2 sm:items-start">
                  <p className="text-xs text-cocoa/70">
                    Suggested customer price: {formatRupees(suggestedPrice)} including GST
                  </p>
                  <p className="text-xs text-cocoa/60">
                    Changing this total updates the GST amount and profit margin at the selected
                    GST rate; the product&apos;s tax rate itself does not change.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSellingPrice(String(suggestedPrice))}
                    className="min-h-10 self-start rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold text-cocoa"
                  >
                    Use suggested price
                  </button>
                </div>
              </div>
              {priceOutcome ? (
                <>
                <p
                  role="status"
                  className="mt-3 rounded-lg border border-mustard/40 bg-mustard/10 p-3 text-sm text-cocoa"
                >
                  {suggestedMinimumOrderQuantity === null
                    ? 'This price cannot reach the target margin at any order quantity. Consider a higher price or lower per-piece costs.'
                    : suggestedMinimumOrderQuantity > 99
                      ? `At least ${suggestedMinimumOrderQuantity} pieces are needed to reach the target margin, which exceeds the 99-piece cart limit. Consider a higher price or lower costs.`
                      : `Suggested minimum order: ${suggestedMinimumOrderQuantity} piece${suggestedMinimumOrderQuantity === 1 ? '' : 's'} to reach the target margin.`}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-cocoa/10 pt-3 text-sm">
                  <span className="text-cocoa/70">Total cost basis</span>
                  <span className="text-right font-medium text-cocoa">{formatRupees(priceOutcome.totalCost)}</span>
                  <span className="text-cocoa/70">GST included in customer price</span>
                  <span className="text-right font-medium text-cocoa">{formatRupees(priceOutcome.gstAmount)}</span>
                  <span className="text-cocoa/70">Customer total (GST included)</span>
                  <span className="text-right font-medium text-cocoa">{formatRupees(priceOutcome.customerTotal)}</span>
                  <span className="text-cocoa/70">Estimated gateway fee (incl. fee GST)</span>
                  <span className="text-right font-medium text-cocoa">{formatRupees(priceOutcome.gatewayFee)}</span>
                  <span className="text-cocoa/70">Estimated net after GST and fee</span>
                  <span className="text-right font-medium text-cocoa">{formatRupees(priceOutcome.expectedNet)}</span>
                  <span className="font-semibold text-cocoa">Estimated profit after costs</span>
                  <span className="text-right font-semibold text-cocoa">{formatRupees(priceOutcome.profit)}</span>
                  <span className="font-bold text-cocoa">Product profit margin</span>
                  <span className="text-right font-bold text-cocoa">
                    {priceOutcome.profitMarginPercent?.toFixed(1)}%
                  </span>
                </div>
                </>
              ) : (
                <p role="status" className="mt-3 text-sm text-red-700">
                  Enter a positive selling price to calculate profit and margin.
                </p>
              )}
              <div className="mt-4 flex justify-end border-t border-cocoa/10 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    if (priceOutcome?.profitMarginPercent !== null && priceOutcome?.profitMarginPercent !== undefined) {
                      onApplyPrice(
                        Number(sellingPrice),
                        priceOutcome.profitMarginPercent,
                        Number(inputs.gstPercent),
                        suggestedMinimumOrderQuantity !== null && suggestedMinimumOrderQuantity <= 99
                          ? suggestedMinimumOrderQuantity
                          : null,
                      );
                    }
                  }}
                  disabled={!priceOutcome || priceOutcome.profitMarginPercent === null}
                  className="min-h-11 rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream"
                >
                  Use in product editor
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={isSavingInputs}
                  onClick={() => void saveInputs()}
                  className="min-h-10 rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-60"
                >
                  {isSavingInputs ? 'Saving values…' : isNewProduct ? 'Save values in draft' : 'Save values for this product'}
                </button>
                {saveInputsMessage && <span role="status" className="text-sm text-green-800">{saveInputsMessage}</span>}
                {saveInputsError && <span role="alert" className="text-sm text-red-700">{saveInputsError}</span>}
              </div>
            </div>
          ) : (
            <p role="status" className="rounded-xl bg-mustard/15 p-3 text-sm text-cocoa">
              Complete the cost and time fields to suggest a price. The 5% GST rate is an editable estimate;
              confirm the correct rate for this product.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
