import { inferMaterialCategory, materialCategories, validateMaterialPurchase, type MaterialPurchase, type MaterialPurchaseInput } from '../../services/materialPurchases';
import { artisanPaymentMethods, type ArtisanPayment, type ArtisanPaymentInput } from '../../services/artisanProfiles';
import { isValidDate, localDate, parseDateInput } from '../../utils/date';
import { csvRecord, parseCsv, TEMPLATE_EXAMPLE } from './sellerSalesReport';

const materialHeaders = ['Record ID', 'Purchase Date', 'Material', 'Supplier', 'Quantity', 'Unit', 'Total', 'Payment Status', 'Notes'];
export const materialTemplateHeaders = [...materialHeaders, 'Category'];
const paymentHeaders = ['Record ID', 'Payment Date', 'Amount', 'Method', 'Reference', 'Work Description', 'Status'];

// Double an original leading apostrophe so formula protection remains reversible.
const exportText = (value: string) => value.startsWith("'") ? `'${value}` : value;
const importText = (value: string) => value.startsWith("''") || /^'\s*[=+\-@]/.test(value) ? value.slice(1) : value;
const record = (values: (string | number)[]) => csvRecord(values.map(value => typeof value === 'string' ? exportText(value) : value));

function readRows(text: string, required: string[], maxRows = 1000) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The CSV must contain a header and at least one entry.');
  if (rows.length > maxRows + 1) throw new Error(`Import at most ${maxRows.toLocaleString('en-IN')} entries per file.`);
  const headers = rows[0].map(value => value.trim().toLowerCase());
  const indexes = required.map(header => headers.indexOf(header.toLowerCase()));
  if (indexes.some(index => index < 0) || new Set(headers).size !== headers.length) {
    throw new Error('CSV columns are missing or duplicated. Download the template and keep its headers.');
  }
  return rows.slice(1).map(row => indexes.map(index => importText(row[index] ?? '').trim()));
}

export function buildMaterialCsv(purchases: MaterialPurchase[]) {
  return [record(materialTemplateHeaders), ...purchases.map(item => record([
    item.id, item.purchased_on, item.material, item.supplier, item.quantity, item.unit, item.total, item.payment_status, item.notes, item.category,
  ]))].join('\r\n');
}

export function parseMaterialCsv(text: string, existing: MaterialPurchase[], ids: Map<number, string>): MaterialPurchaseInput[] {
  const seen = new Set<string>();
  const newRows = new Set<string>();
  const headers = parseCsv(text)[0]?.map(value => value.trim().toLowerCase()) ?? [];
  const withCategory = headers.includes('category');
  return readRows(text, withCategory ? materialTemplateHeaders : materialHeaders).map((row, index) => {
    const [id, date, material, supplier, quantity, unit, total, status, notes, categoryText] = row;
    if (notes === TEMPLATE_EXAMPLE) throw new Error(`Row ${index + 2}: replace or delete the example row before uploading.`);
    if (id && !existing.some(item => item.id === id)) throw new Error(`Row ${index + 2}: purchase ID not found. Leave it blank for a new purchase.`);
    const key = id || ids.get(index) || crypto.randomUUID();
    ids.set(index, key);
    if (seen.has(key)) throw new Error(`Row ${index + 2}: duplicate purchase ID.`);
    seen.add(key);
    if (status !== 'Paid' && status !== 'Unpaid') throw new Error(`Row ${index + 2}: payment status must be Paid or Unpaid.`);
    const category = categoryText ? materialCategories.find(value => value.toLowerCase() === categoryText.toLowerCase())
      : existing.find(item => item.id === key)?.category ?? inferMaterialCategory(material);
    if (!category) throw new Error(`Row ${index + 2}: category must be Yarn, Tool, Accessories, Packaging or Uncategorized.`);
    const item: MaterialPurchaseInput = { id: key, purchased_on: parseDateInput(date), material, category, supplier,
      quantity: Number(quantity), unit, total: Number(total), payment_status: status, notes };
    try { validateMaterialPurchase(item); }
    catch (error) { throw new Error(`Row ${index + 2}: ${error instanceof Error ? error.message : 'Invalid purchase.'}`); }
    const signature = JSON.stringify([item.purchased_on, item.material, item.supplier, item.quantity, item.unit, item.total, item.payment_status, item.notes]);
    if (!id && newRows.has(signature)) throw new Error(`Row ${index + 2}: duplicate new purchase in this CSV.`);
    if (!id) newRows.add(signature);
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

export function buildPaymentTemplate() {
  return [record(paymentHeaders), record(['', localDate(), 500, 'Cash', '', TEMPLATE_EXAMPLE, 'Recorded'])].join('\r\n');
}

export function parsePaymentCsv(text: string, existing: ArtisanPayment[], ids: Map<number, string>, maxRows = 1000) {
  const seen = new Set<string>();
  const newRows = new Set<string>();
  return readRows(text, paymentHeaders, maxRows).map((row, index) => {
    const [id, date, amount, method, reference, description, status] = row;
    if (description === TEMPLATE_EXAMPLE) throw new Error(`Row ${index + 2}: replace or delete the example row before uploading.`);
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
    const signature = JSON.stringify([input.date, Number(input.amount), input.method, input.reference, input.description]);
    if (!id && newRows.has(signature)) throw new Error(`Row ${index + 2}: duplicate new payment in this CSV.`);
    if (!id) newRows.add(signature);
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

export interface ArtisanPaymentLedger {
  id: string;
  name: string;
  payments: ArtisanPayment[];
}

export const artisanPaymentLabel = (artisan: Pick<ArtisanPaymentLedger, 'id' | 'name'>) => `${artisan.name} [${artisan.id}]`;
export const allPaymentHeaders = ['Artisan', ...paymentHeaders, 'Void Reason'];

export function buildAllPaymentCsv(artisans: ArtisanPaymentLedger[]) {
  const rows = artisans.flatMap(artisan => artisan.payments.map(payment => record([
    artisanPaymentLabel(artisan), payment.id, payment.paid_on, payment.amount, payment.method, payment.reference,
    payment.description, payment.voided_at ? 'Voided' : 'Recorded', payment.void_reason ?? '',
  ])));
  return [record(allPaymentHeaders), ...rows].join('\r\n');
}

export function parseAllPaymentCsv(text: string, artisans: ArtisanPaymentLedger[], ids: Map<number, string>) {
  const rows = readRows(text, ['Artisan', ...paymentHeaders], Number.POSITIVE_INFINITY);
  const directory = new Map(artisans.map(artisan => [artisan.id, artisan]));
  const grouped = new Map<string, { artisan: ArtisanPaymentLedger; rows: { index: number; values: string[] }[] }>();
  rows.forEach(([label, ...values], index) => {
    const match = / \[([^\]]+)\]$/.exec(label);
    const artisan = match && directory.get(match[1]);
    if (!artisan) throw new Error(`Row ${index + 2}: choose a valid artisan from the template, including their ID.`);
    const group = grouped.get(artisan.id) ?? { artisan, rows: [] };
    group.rows.push({ index, values });
    grouped.set(artisan.id, group);
  });
  const results: { index: number; artisanId: string; id: string; input: ArtisanPaymentInput; exists: boolean }[] = [];
  for (const { artisan, rows: entries } of grouped.values()) {
    const localIds = new Map<number, string>();
    entries.forEach((entry, index) => { const id = ids.get(entry.index); if (id) localIds.set(index, id); });
    const csv = [record(paymentHeaders), ...entries.map(entry => record(entry.values))].join('\r\n');
    let parsed: ReturnType<typeof parsePaymentCsv>;
    try { parsed = parsePaymentCsv(csv, artisan.payments, localIds, Number.POSITIVE_INFINITY); }
    catch (failure) {
      if (!(failure instanceof Error)) throw failure;
      throw new Error(failure.message.replace(/^Row (\d+):/, (_, number: string) => `Row ${entries[Number(number) - 2].index + 2}:`));
    }
    parsed.forEach((entry, index) => {
      const originalIndex = entries[index].index;
      ids.set(originalIndex, entry.id);
      results.push({ ...entry, index: originalIndex, artisanId: artisan.id });
    });
  }
  return results.sort((a, b) => a.index - b.index);
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
