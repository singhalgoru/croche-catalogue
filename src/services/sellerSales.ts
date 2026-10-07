import { loadSupabase } from '../lib/supabaseConfig';

export const SALE_CHANNELS = ['online', 'offline', 'whatsapp', 'instagram', 'other'] as const;
export type SaleChannel = (typeof SALE_CHANNELS)[number];

export interface SellerSale {
  id: string;
  productId: string | null;
  productName: string;
  variantName: string;
  saleDate: string;
  channel: SaleChannel;
  quantity: number;
  unitPrice: number;
  gstPercent: number;
  materialCost: number;
  labourCost: number;
  packagingCost: number;
  shippingCost: number;
  gatewayFeePercent: number;
  gatewayFeeGstPercent: number;
  notes: string;
  createdAt: string;
}

export type SellerSaleInput = Omit<SellerSale, 'id' | 'createdAt'>;

interface SellerSaleRow {
  id: string;
  product_id: string | null;
  product_name: string;
  variant_name: string;
  sale_date: string;
  channel: SaleChannel;
  quantity: number;
  unit_price: number;
  gst_percent: number;
  material_cost: number;
  labour_cost: number;
  packaging_cost: number;
  shipping_cost: number;
  gateway_fee_percent: number;
  gateway_fee_gst_percent: number;
  notes: string;
  created_at: string;
}

const SALE_COLUMNS =
  'id, product_id, product_name, variant_name, sale_date, channel, quantity, unit_price, gst_percent, material_cost, labour_cost, packaging_cost, shipping_cost, gateway_fee_percent, gateway_fee_gst_percent, notes, created_at';

const requireSupabase = async () => {
  const client = await loadSupabase();
  if (!client) throw new Error('Supabase is not configured.');
  return client;
};

const mapSale = (row: SellerSaleRow): SellerSale => ({
  id: row.id,
  productId: row.product_id,
  productName: row.product_name,
  variantName: row.variant_name,
  saleDate: row.sale_date,
  channel: row.channel,
  quantity: row.quantity,
  unitPrice: Number(row.unit_price),
  gstPercent: Number(row.gst_percent),
  materialCost: Number(row.material_cost),
  labourCost: Number(row.labour_cost),
  packagingCost: Number(row.packaging_cost),
  shippingCost: Number(row.shipping_cost),
  gatewayFeePercent: Number(row.gateway_fee_percent),
  gatewayFeeGstPercent: Number(row.gateway_fee_gst_percent),
  notes: row.notes,
  createdAt: row.created_at,
});

const saleColumns = (sale: SellerSaleInput) => {
  if (!sale.productName.trim() || sale.productName.trim().length > 150) {
    throw new Error('Choose a product or enter a product name of at most 150 characters.');
  }
  if (sale.variantName.length > 100 || sale.notes.length > 1000) {
    throw new Error('Variant names must be under 100 characters and notes under 1,000 characters.');
  }
  const dateParts = sale.saleDate.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(sale.saleDate)
    || parsedDate.getUTCFullYear() !== dateParts[0]
    || parsedDate.getUTCMonth() !== dateParts[1] - 1
    || parsedDate.getUTCDate() !== dateParts[2]
  ) {
    throw new Error('Enter a valid sale date.');
  }
  if (!(SALE_CHANNELS as readonly string[]).includes(sale.channel)) {
    throw new Error('Choose a valid sales channel.');
  }
  if (!Number.isInteger(sale.quantity) || sale.quantity < 1 || sale.quantity > 100000) {
    throw new Error('Quantity must be a whole number between 1 and 100,000.');
  }
  const numericValues = [
    sale.unitPrice,
    sale.gstPercent,
    sale.materialCost,
    sale.labourCost,
    sale.packagingCost,
    sale.shippingCost,
    sale.gatewayFeePercent,
    sale.gatewayFeeGstPercent,
  ];
  if (numericValues.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Prices, tax rates and costs must be finite, non-negative numbers.');
  }
  if (sale.unitPrice <= 0) throw new Error('Selling price must be greater than zero.');
  if (sale.gstPercent > 100 || sale.gatewayFeePercent > 100 || sale.gatewayFeeGstPercent > 100) {
    throw new Error('Tax and gateway fee rates cannot exceed 100%.');
  }
  return {
    product_id: sale.productId,
    product_name: sale.productName.trim(),
    variant_name: sale.variantName.trim(),
    sale_date: sale.saleDate,
    channel: sale.channel,
    quantity: sale.quantity,
    unit_price: sale.unitPrice,
    gst_percent: sale.gstPercent,
    material_cost: sale.materialCost,
    labour_cost: sale.labourCost,
    packaging_cost: sale.packagingCost,
    shipping_cost: sale.shippingCost,
    gateway_fee_percent: sale.gatewayFeePercent,
    gateway_fee_gst_percent: sale.gatewayFeeGstPercent,
    notes: sale.notes.trim(),
  };
};

export async function fetchSellerSales(): Promise<SellerSale[]> {
  const client = await requireSupabase();
  const { data, error } = await client
    .from('seller_sales')
    .select(SALE_COLUMNS)
    .order('sale_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Unable to load sales: ${error.message}`);
  return (data as SellerSaleRow[]).map(mapSale);
}

export async function createSellerSale(sale: SellerSaleInput): Promise<SellerSale> {
  const values = saleColumns(sale);
  const client = await requireSupabase();
  const { data, error } = await client
    .from('seller_sales')
    .insert(values)
    .select(SALE_COLUMNS)
    .single();
  if (error) throw new Error(`Unable to save sale: ${error.message}`);
  return mapSale(data as SellerSaleRow);
}

export async function updateSellerSale(
  saleId: string,
  sale: SellerSaleInput,
): Promise<SellerSale> {
  const values = saleColumns(sale);
  const client = await requireSupabase();
  const { data, error } = await client
    .from('seller_sales')
    .update(values)
    .eq('id', saleId)
    .select(SALE_COLUMNS)
    .single();
  if (error) throw new Error(`Unable to update sale: ${error.message}`);
  return mapSale(data as SellerSaleRow);
}

export async function deleteSellerSale(saleId: string): Promise<void> {
  const client = await requireSupabase();
  const { error } = await client.from('seller_sales').delete().eq('id', saleId);
  if (error) throw new Error(`Unable to delete sale: ${error.message}`);
}
