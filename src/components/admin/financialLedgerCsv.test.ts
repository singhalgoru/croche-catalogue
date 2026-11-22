import { describe, expect, it } from 'vitest';
import type { MaterialPurchase } from '../../services/materialPurchases';
import type { ArtisanPayment } from '../../services/artisanProfiles';
import { buildAllPaymentCsv, buildMaterialCsv, buildMaterialTemplate, buildPaymentCsv, buildPaymentTemplate, parseAllPaymentCsv, parseMaterialCsv, parsePaymentCsv } from './financialLedgerCsv';

const purchase: MaterialPurchase = { id: 'existing', purchased_on: '2025-03-31', material: '=yarn', supplier: "'=shop",
  category: 'Yarn', quantity: 2, unit: 'balls', total: 25.5, payment_status: 'Paid', notes: 'Line one,\n"line two"', receipt_name: 'bill.pdf' };
const payment: ArtisanPayment = { id: 'existing-payment', paid_on: '2025-03-31', amount: 125.5, method: 'UPI',
  reference: 'ref', description: 'Batch', created_at: '', voided_at: null, void_reason: null };

describe('financial ledger CSV', () => {
  it('provides example rows but rejects them until replaced or deleted', () => {
    expect(() => parseMaterialCsv(buildMaterialTemplate(), [], new Map())).toThrow(/Row 2: replace or delete the example row/);
    expect(() => parsePaymentCsv(buildPaymentTemplate(), [], new Map())).toThrow(/Row 2: replace or delete the example row/);
    const material = buildMaterialTemplate().replace('EXAMPLE - replace or delete this row', 'Real purchase');
    expect(parseMaterialCsv(material, [], new Map())[0].notes).toBe('Real purchase');
    const paymentCsv = buildPaymentTemplate().replace('EXAMPLE - replace or delete this row', 'Real work');
    expect(parsePaymentCsv(paymentCsv, [], new Map())[0].input.description).toBe('Real work');
  });
  it('imports categories, infers yarn and preserves existing categories from older CSVs', () => {
    const header = 'Record ID,Purchase Date,Material,Supplier,Quantity,Unit,Total,Payment Status,Notes';
    const rows = `${header},Category\n,2025-03-31,Hook,Shop,1,piece,25,Paid,,Tool`;
    expect(parseMaterialCsv(rows, [], new Map())[0].category).toBe('Tool');
    expect(() => parseMaterialCsv(rows.replace('Tool', 'Unknown'), [], new Map())).toThrow(/category must be/);
    expect(parseMaterialCsv(`${header}\n,2025-03-31,Acrylic wool,Shop,1,ball,25,Paid,`, [], new Map())[0].category).toBe('Yarn');
    expect(parseMaterialCsv(`${header}\nexisting,2025-03-31,Hook,Shop,1,piece,25,Paid,`, [{ ...purchase, category: 'Accessories' }], new Map())[0].category).toBe('Accessories');
  });
  it('accepts filled blank purchase and per-artisan payment templates', () => {
    const material = `${buildMaterialCsv([])}\r\n,2025-03-31,Yarn,Shop,2,balls,25.50,Paid,`;
    expect(parseMaterialCsv(material, [], new Map())[0]).toMatchObject({
      purchased_on: '2025-03-31', material: 'Yarn', total: 25.5, payment_status: 'Paid',
    });
    const payments = `${buildPaymentCsv([])}\r\n,2025-03-31,125.50,UPI,txn-1,Flowers,Recorded`;
    expect(parsePaymentCsv(payments, [], new Map())[0]).toMatchObject({
      exists: false, input: { date: '2025-03-31', amount: '125.50', method: 'UPI', description: 'Flowers' },
    });
  });
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
  it('rejects repeated new rows within the same CSV before saving', () => {
    expect(() => parseMaterialCsv(buildMaterialCsv([{ ...purchase, id: '' }, { ...purchase, id: '' }]), [], new Map()))
      .toThrow(/duplicate new purchase/);
    expect(() => parsePaymentCsv(buildPaymentCsv([{ ...payment, id: '' }, { ...payment, id: '' }]), [], new Map()))
      .toThrow(/duplicate new payment/);
  });
  it('routes identical names by artisan ID and preserves recorded and voided entries on export', () => {
    const artisans = [
      { id: 'one', name: 'Maker', payments: [payment] },
      { id: 'two', name: 'Maker', payments: [{ ...payment, id: 'voided', voided_at: '2025-04-01', void_reason: 'Correction' }] },
    ];
    const csv = buildAllPaymentCsv(artisans);
    expect(csv).toContain('Correction');
    expect(parseAllPaymentCsv(csv, artisans, new Map()).map(entry => [entry.artisanId, entry.exists]))
      .toEqual([['one', true], ['two', true]]);
    expect(() => parseAllPaymentCsv(csv.replace('Maker [two]', 'Maker [unknown]'), artisans, new Map())).toThrow(/Row 3: choose a valid artisan/);
  });
  it('rejects duplicate new payments for the same artisan and retains IDs across retries', () => {
    const artisans = [{ id: 'one', name: 'Maker', payments: [] }, { id: 'two', name: 'Maker', payments: [] }];
    const csv = `${buildAllPaymentCsv([])}\r\nMaker [one],,2025-03-31,125.50,UPI,ref,Batch,Recorded,\r\nMaker [two],,2025-03-31,125.50,UPI,ref,Batch,Recorded,`;
    const ids = new Map<number, string>();
    const first = parseAllPaymentCsv(csv, artisans, ids);
    expect(first.map(entry => entry.artisanId)).toEqual(['one', 'two']);
    expect(parseAllPaymentCsv(csv, artisans, ids).map(entry => entry.id)).toEqual(first.map(entry => entry.id));
    expect(() => parseAllPaymentCsv(csv.replace('Maker [two]', 'Maker [one]'), artisans, new Map())).toThrow(/Row 3: duplicate new payment/);
    expect(() => parseAllPaymentCsv(csv, [{ ...artisans[0], payments: [payment] }, artisans[1]], new Map())).toThrow(/Row 2: an identical payment/);
  });
});
