import { loadSupabase } from '../lib/supabaseConfig';

export const materialCategories = ['Yarn', 'Tool', 'Accessories', 'Packaging', 'Uncategorized'] as const;
export type MaterialCategory = typeof materialCategories[number];
export const inferMaterialCategory = (material: string): MaterialCategory =>
  /\b(yarn|acrylic|chenille|wool)\b/i.test(material) ? 'Yarn' : 'Uncategorized';

export interface MaterialPurchase {
  id: string;
  purchased_on: string;
  material: string;
  category: MaterialCategory;
  supplier: string;
  quantity: number;
  unit: string;
  total: number;
  payment_status: 'Paid' | 'Unpaid';
  notes: string;
  receipt_name: string | null;
}
export type MaterialPurchaseInput = Omit<MaterialPurchase, 'receipt_name'>;

export function purchaseBreakdown(purchases: MaterialPurchase[], group: 'category' | 'supplier') {
  const amounts = new Map<string, { name: string; paise: number }>();
  for (const purchase of purchases) {
    const name = (group === 'category' ? purchase.category : purchase.supplier.trim()) || 'Not provided';
    const key = name.toLocaleLowerCase();
    const existing = amounts.get(key);
    amounts.set(key, { name: existing?.name ?? name, paise: (existing?.paise ?? 0) + Math.round(purchase.total * 100) });
  }
  return [...amounts.values()].map(item => ({ name: item.name, total: item.paise / 100 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export function summarizeMaterialPurchases(purchases: MaterialPurchase[], month: string) {
  const monthly = month ? purchases.filter(item => item.purchased_on.startsWith(`${month}-`)) : [];
  let paidPaise = 0;
  let unpaidPaise = 0;
  const materials = new Map<string, { name: string; paise: number }>();
  for (const purchase of monthly) {
    const paise = Math.round(purchase.total * 100);
    if (purchase.payment_status === 'Paid') paidPaise += paise;
    else unpaidPaise += paise;
    const key = purchase.material.trim().toLocaleLowerCase();
    const previous = materials.get(key);
    materials.set(key, { name: previous?.name ?? purchase.material, paise: (previous?.paise ?? 0) + paise });
  }
  return { monthly, paid: paidPaise / 100, unpaid: unpaidPaise / 100,
    materials: Array.from(materials.values(), item => ({ name: item.name, total: item.paise / 100 })) };
}

const client = async () => {
  const db = await loadSupabase();
  if (!db) throw new Error('Materials require an online connection.');
  return db;
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateMaterialPurchase(input: MaterialPurchaseInput): void {
  const date = new Date(`${input.purchased_on}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.purchased_on) || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== input.purchased_on) throw new Error('Enter a valid purchase date.');
  if (!input.material.trim() || input.material.trim().length > 150) throw new Error('Enter a material name up to 150 characters.');
  if (!materialCategories.some(category => category === input.category)) throw new Error('Choose a valid purchase category.');
  if (input.supplier.length > 150 || input.notes.length > 1000) throw new Error('Supplier or notes are too long.');
  if (!input.unit.trim() || input.unit.trim().length > 30) throw new Error('Enter a unit up to 30 characters.');
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || input.quantity >= 1e9
    || Math.abs(input.quantity * 1000 - Math.round(input.quantity * 1000)) > 0.0001) {
    throw new Error('Quantity must be positive, below 1 billion and have at most three decimal places.');
  }
  if (!Number.isFinite(input.total) || input.total <= 0 || input.total >= 1e10
    || Math.abs(input.total * 100 - Math.round(input.total * 100)) > 0.0001) {
    throw new Error('Total must be positive, below ₹10 billion and have at most two decimal places.');
  }
  if (input.payment_status !== 'Paid' && input.payment_status !== 'Unpaid') throw new Error('Choose a payment status.');
}

export async function fetchMaterialPurchases(): Promise<MaterialPurchase[]> {
  const db = await client();
  const purchases: MaterialPurchase[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from('material_purchases')
      .select('id,purchased_on,material,category,supplier,quantity,unit,total,payment_status,notes,receipt_name')
      .order('purchased_on', { ascending: false }).order('id').range(offset, offset + 499);
    if (error) throw new Error(`Unable to load material purchases: ${error.message}`);
    if (!Array.isArray(data)) throw new Error('Invalid material purchases response.');
    const rows: MaterialPurchase[] = data.map((row: unknown) => {
      if (!isRecord(row)) throw new Error('Invalid material purchase response.');
      const value = row;
      if (typeof value.id !== 'string' || typeof value.purchased_on !== 'string'
        || typeof value.material !== 'string' || typeof value.supplier !== 'string' || typeof value.unit !== 'string'
        || !materialCategories.some(category => category === value.category)
        || typeof value.notes !== 'string' || !(value.receipt_name === null || typeof value.receipt_name === 'string')
        || !(value.payment_status === 'Paid' || value.payment_status === 'Unpaid')
        || !(['number', 'string'].includes(typeof value.quantity) && Number.isFinite(Number(value.quantity)) && Number(value.quantity) > 0)
        || !(['number', 'string'].includes(typeof value.total) && Number.isFinite(Number(value.total)) && Number(value.total) > 0)) {
        throw new Error('Invalid material purchase response.');
      }
      const category = materialCategories.find(item => item === value.category);
      if (!category) throw new Error('Invalid material purchase category.');
      return { id: value.id, purchased_on: value.purchased_on, material: value.material, category, supplier: value.supplier,
        quantity: Number(value.quantity), unit: value.unit, total: Number(value.total), payment_status: value.payment_status,
        notes: value.notes, receipt_name: value.receipt_name };
    });
    purchases.push(...rows);
    if (rows.length < 500) return purchases;
  }
}

export function validateMaterialReceipt(file: File): void {
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size < 1
    || file.size > 2 * 1024 * 1024 || !file.name.trim() || file.name.length > 150) {
    throw new Error('Choose a PDF, JPG or PNG receipt up to 2 MB, with a filename up to 150 characters.');
  }
}

async function encodeReceipt(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' && reader.result.includes(';base64,')
      ? resolve(reader.result.split(';base64,')[1]!) : reject(new Error('Unable to read receipt.'));
    reader.onerror = () => reject(new Error('Unable to read receipt.'));
    reader.readAsDataURL(file);
  });
}

export async function saveMaterialPurchase(input: MaterialPurchaseInput, file: File | null, removeReceipt: boolean): Promise<void> {
  validateMaterialPurchase(input);
  if (file) validateMaterialReceipt(file);
  if (file && removeReceipt) throw new Error('Choose either a replacement receipt or removal, not both.');
  const encoded = file ? await encodeReceipt(file) : null;
  const db = await client();
  const { data, error } = await db.rpc('save_categorized_material_purchase', {
    purchase_id: input.id, purchase_date: input.purchased_on, material_name: input.material,
    supplier_name: input.supplier, quantity_value: input.quantity, quantity_unit: input.unit,
    total_value: input.total, status_value: input.payment_status, note_text: input.notes, category_value: input.category,
    receipt_filename: file?.name ?? null, receipt_type: file?.type ?? null,
    receipt_data: encoded, remove_receipt: removeReceipt,
  });
  if (error) throw new Error(`Unable to save material purchase: ${error.message}`);
  if (data !== input.id) throw new Error('Purchase save could not be confirmed. Refresh before retrying.');
}

export async function setMaterialPurchaseCategory(id: string, category: MaterialCategory) {
  const db = await client();
  const { data, error } = await db.rpc('set_material_purchase_category', { target: id, category_value: category });
  if (error) throw new Error(`Unable to update category: ${error.message}`);
  if (data !== id) throw new Error('Category update could not be confirmed. Refresh before retrying.');
}

export async function deleteMaterialPurchase(id: string): Promise<void> {
  const db = await client();
  const { data, error } = await db.rpc('delete_material_purchase', { target: id });
  if (error) throw new Error(`Unable to delete purchase: ${error.message}`);
  if (data !== id) throw new Error('Purchase deletion could not be confirmed. Refresh before retrying.');
}

export async function downloadMaterialReceipt(id: string): Promise<void> {
  const db = await client();
  const { data, error } = await db.rpc('read_material_receipt', { target: id });
  if (error) throw new Error(`Unable to download receipt: ${error.message}`);
  if (!data || typeof data.name !== 'string' || typeof data.data !== 'string'
    || !['application/pdf', 'image/jpeg', 'image/png'].includes(data.type)
    || data.data.length > 2834000 || !/^[A-Za-z0-9+/\s]*={0,2}$/.test(data.data)) {
    throw new Error('Invalid receipt response.');
  }
  const bytes = Uint8Array.from(atob(data.data.replace(/\s/g, '')), char => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: data.type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = data.name; document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
