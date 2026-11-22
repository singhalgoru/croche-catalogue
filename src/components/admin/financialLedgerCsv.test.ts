import { describe, expect, it } from 'vitest';
import type { MaterialPurchase } from '../../services/materialPurchases';
import type { ArtisanPayment } from '../../services/artisanProfiles';
import { buildMaterialCsv, buildPaymentCsv, parseMaterialCsv, parsePaymentCsv } from './financialLedgerCsv';

const purchase: MaterialPurchase = { id: 'existing', purchased_on: '2025-03-31', material: '=yarn', supplier: "'=shop",
  quantity: 2, unit: 'balls', total: 25.5, payment_status: 'Paid', notes: 'Line one,\n"line two"', receipt_name: 'bill.pdf' };
const payment: ArtisanPayment = { id: 'existing-payment', paid_on: '2025-03-31', amount: 125.5, method: 'UPI',
  reference: 'ref', description: 'Batch', created_at: '', voided_at: null, void_reason: null };

describe('financial ledger CSV', () => {
  it('round-trips material records, protects spreadsheet formulas and preserves the existing ID', () => {
    const csv = buildMaterialCsv([purchase]);
    expect(csv).toContain("'=yarn");
    const [parsed] = parseMaterialCsv(csv, [purchase], new Map());
    expect(parsed).toMatchObject({ id: purchase.id, material: purchase.material, supplier: purchase.supplier, total: purchase.total });
    expect(parsed.notes).toBe(purchase.notes);
  });
  it('rejects invalid rows and unknown IDs before import', () => {
    expect(() => parseMaterialCsv(buildMaterialCsv([{ ...purchase, id: 'unknown' }]), [purchase], new Map())).toThrow(/ID not found/);
    expect(() => parseMaterialCsv(buildMaterialCsv([{ ...purchase, purchased_on: '2025-02-30' }]), [purchase], new Map())).toThrow(/valid purchase date/);
    expect(() => parseMaterialCsv(buildMaterialCsv([{ ...purchase, id: '' }]), [purchase], new Map())).toThrow(/identical purchase/);
  });
  it('does not alter existing payments and includes voided ledger entries', () => {
    const entries = [payment, { ...payment, id: 'voided', voided_at: '2025-04-01', void_reason: 'Correction' }];
    const csv = buildPaymentCsv(entries);
    expect(parsePaymentCsv(csv, entries, new Map()).every(entry => entry.exists)).toBe(true);
    expect(() => parsePaymentCsv(buildPaymentCsv([{ ...payment, amount: 140 }]), entries, new Map())).toThrow(/cannot be changed/);
  });
  it('keeps new IDs stable for retries and rejects identical recorded payments', () => {
    const csv = buildPaymentCsv([{ ...payment, id: '' }]);
    const ids = new Map<number, string>();
    const first = parsePaymentCsv(csv, [], ids)[0];
    expect(parsePaymentCsv(csv, [{ ...payment, id: first.id }], ids)[0]).toMatchObject({ id: first.id, exists: true });
    expect(() => parsePaymentCsv(csv, [payment], new Map())).toThrow(/identical payment/);
  });
});
