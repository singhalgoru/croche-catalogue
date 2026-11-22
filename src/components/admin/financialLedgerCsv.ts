import { validateMaterialPurchase, type MaterialPurchase, type MaterialPurchaseInput } from '../../services/materialPurchases';
import { artisanPaymentMethods, type ArtisanPayment, type ArtisanPaymentInput } from '../../services/artisanProfiles';
import { isValidDate, localDate, parseDateInput } from '../../utils/date';
import { csvRecord, parseCsv } from './sellerSalesReport';

const materialHeaders = ['Record ID', 'Purchase Date', 'Material', 'Supplier', 'Quantity', 'Unit', 'Total', 'Payment Status', 'Notes'];
const paymentHeaders = ['Record ID', 'Payment Date', 'Amount', 'Method', 'Reference', 'Work Description', 'Status'];

// Double an original leading apostrophe so formula protection remains reversible.
const exportText = (value: string) => value.startsWith("'") ? `'${value}` : value;
const importText = (value: string) => value.startsWith("''") || /^'\s*[=+\-@]/.test(value) ? value.slice(1) : value;
const record = (values: (string | number)[]) => csvRecord(values.map(value => typeof value === 'string' ? exportText(value) : value));

function readRows(text: string, required: string[]) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The CSV must contain a header and at least one entry.');
  if (rows.length > 1001) throw new Error('Import at most 1,000 entries per file.');
  const headers = rows[0].map(value => value.trim().toLowerCase());
  const indexes = required.map(header => headers.indexOf(header.toLowerCase()));
  if (indexes.some(index => index < 0) || new Set(headers).size !== headers.length) {
    throw new Error('CSV columns are missing or duplicated. Download the template and keep its headers.');
  }
  return rows.slice(1).map(row => indexes.map(index => importText(row[index] ?? '').trim()));
}

export function buildMaterialCsv(purchases: MaterialPurchase[]) {
  return [record(materialHeaders), ...purchases.map(item => record([
    item.id, item.purchased_on, item.material, item.supplier, item.quantity, item.unit, item.total, item.payment_status, item.notes,
  ]))].join('\r\n');
}

export function parseMaterialCsv(text: string, existing: MaterialPurchase[], ids: Map<number, string>): MaterialPurchaseInput[] {
  const seen = new Set<string>();
  return readRows(text, materialHeaders).map((row, index) => {
    const [id, date, material, supplier, quantity, unit, total, status, notes] = row;
    if (id && !existing.some(item => item.id === id)) throw new Error(`Row ${index + 2}: purchase ID not found. Leave it blank for a new purchase.`);
    const key = id || ids.get(index) || crypto.randomUUID();
    ids.set(index, key);
    if (seen.has(key)) throw new Error(`Row ${index + 2}: duplicate purchase ID.`);
    seen.add(key);
    if (status !== 'Paid' && status !== 'Unpaid') throw new Error(`Row ${index + 2}: payment status must be Paid or Unpaid.`);
    const item: MaterialPurchaseInput = { id: key, purchased_on: parseDateInput(date), material, supplier,
      quantity: Number(quantity), unit, total: Number(total), payment_status: status, notes };
    try { validateMaterialPurchase(item); }
    catch (error) { throw new Error(`Row ${index + 2}: ${error instanceof Error ? error.message : 'Invalid purchase.'}`); }
    if (!id && !existing.some(entry => entry.id === key) && existing.some(entry =>
      entry.purchased_on === item.purchased_on && entry.material === item.material && entry.supplier === item.supplier
      && entry.quantity === item.quantity && entry.unit === item.unit && entry.total === item.total
      && entry.payment_status === item.payment_status && entry.notes === item.notes)) {
      throw new Error(`Row ${index + 2}: an identical purchase already exists. Check the register before importing to avoid a duplicate.`);
    }
    return item;
  });
}

export function buildPaymentCsv(payments: ArtisanPayment[]) {
  return [record(paymentHeaders), ...payments.map(item => record([
    item.id, item.paid_on, item.amount, item.method, item.reference, item.description, item.voided_at ? 'Voided' : 'Recorded',
  ]))].join('\r\n');
}

export function parsePaymentCsv(text: string, existing: ArtisanPayment[], ids: Map<number, string>) {
  const seen = new Set<string>();
  return readRows(text, paymentHeaders).map((row, index) => {
    const [id, date, amount, method, reference, description, status] = row;
    const key = id || ids.get(index) || crypto.randomUUID();
    const previous = existing.find(item => item.id === key);
    if (id && !previous) throw new Error(`Row ${index + 2}: payment ID not found for this artisan. Leave it blank for a new payment.`);
    ids.set(index, key);
    if (seen.has(key)) throw new Error(`Row ${index + 2}: duplicate payment ID.`);
    seen.add(key);
    const paymentDate = parseDateInput(date);
    const paymentMethod = artisanPaymentMethods.find(value => value === method);
    if (!isValidDate(paymentDate) || paymentDate < '2000-01-01' || paymentDate > localDate()
      || !/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > 10000000
      || !paymentMethod || reference.length > 200 || (paymentMethod !== 'Cash' && !reference)
      || !description || description.length > 1000 || (status !== 'Recorded' && status !== 'Voided')) {
      throw new Error(`Row ${index + 2}: check payment date, amount, method, reference, description and status.`);
    }
    const input: ArtisanPaymentInput = { date: paymentDate, amount, method: paymentMethod, reference, description };
    if (previous && (previous.paid_on !== input.date || previous.amount !== Number(input.amount)
      || previous.method !== input.method || previous.reference !== input.reference || previous.description !== input.description
      || (previous.voided_at ? 'Voided' : 'Recorded') !== status)) {
      throw new Error(`Row ${index + 2}: existing payments cannot be changed through CSV. Void and replace the payment in the ledger.`);
    }
    if (!previous && existing.some(item => item.paid_on === input.date && item.amount === Number(input.amount)
      && item.method === input.method && item.reference === input.reference && item.description === input.description)) {
      throw new Error(`Row ${index + 2}: an identical payment already exists. Check the ledger before importing to avoid a duplicate.`);
    }
    if (!previous && status !== 'Recorded') throw new Error(`Row ${index + 2}: new payments must have Recorded status.`);
    return { id: key, input, exists: Boolean(previous) };
  });
}

export function downloadLedgerCsv(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function validateLedgerFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Upload an Excel-compatible CSV file.');
  if (file.size > 5 * 1024 * 1024) throw new Error('The CSV must be smaller than 5 MB.');
}
