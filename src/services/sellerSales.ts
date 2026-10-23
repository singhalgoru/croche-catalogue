import { loadSupabase } from '../lib/supabaseConfig';

export const SALE_CHANNELS = ['online', 'offline', 'whatsapp', 'instagram', 'other'] as const;
export type SaleChannel = (typeof SALE_CHANNELS)[number];
export interface SellerOrder {
  id: string;
  reference: string;
  paymentOrderId: string | null;
  packagingCost: number;
  shippingCost: number;
  shippingCollected: number;
  shippingSource: 'manual' | 'courier' | 'estimate';
  itemRevenue: number;
}

export interface SellerSale {
  order?: SellerOrder;
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

export type SellerSaleInput = Omit<SellerSale, 'id' | 'createdAt' | 'order'>;

interface SellerSaleRow {
  order?: {
    id: string; reference: string; payment_order_id: string | null; packaging_cost: number; shipping_cost: number;
    shipping_collected: number; shipping_source: SellerOrder['shippingSource'];
    items: { unit_price: number; quantity: number }[];
  };
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
  'id, product_id, product_name, variant_name, sale_date, channel, quantity, unit_price, gst_percent, material_cost, labour_cost, packaging_cost, shipping_cost, gateway_fee_percent, gateway_fee_gst_percent, notes, created_at, order:seller_orders!seller_sales_order_id_fkey(id,reference,payment_order_id,packaging_cost,shipping_cost,shipping_collected,shipping_source,items:seller_sales!seller_sales_order_id_fkey(unit_price,quantity))';

const requireSupabase = async () => {
  const client = await loadSupabase();
  if (!client) throw new Error('Supabase is not configured.');
  return client;
};

const mapSale = (row: SellerSaleRow): SellerSale => ({
  ...(row.order ? { order: {
    id: row.order.id, reference: row.order.reference, paymentOrderId: row.order.payment_order_id,
    packagingCost: Number(row.order.packaging_cost), shippingCost: Number(row.order.shipping_cost),
    shippingCollected: Number(row.order.shipping_collected), shippingSource: row.order.shipping_source,
    itemRevenue: row.order.items.reduce((sum,item) => sum + Number(item.unit_price) * item.quantity,0),
  } } : {}),
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
  const sales: SellerSale[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client
      .from('seller_sales')
      .select(SALE_COLUMNS)
      .order('sale_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(offset, offset + 499)
      .overrideTypes<SellerSaleRow[], { merge: false }>();
    if (error) throw new Error(`Unable to load sales: ${error.message}`);
    if (!data) throw new Error('Unable to load sales: missing response.');
    const rows = data;
    sales.push(...rows.map(mapSale));
    if (rows.length < 500) return sales;
  }
}

export async function createSellerSale(sale: SellerSaleInput): Promise<SellerSale> {
  const values = saleColumns(sale);
  const client = await requireSupabase();
  const { data, error } = await client
    .from('seller_sales')
    .insert(values)
    .select(SALE_COLUMNS)
    .single().overrideTypes<SellerSaleRow, { merge: false }>();
  if (error) throw new Error(`Unable to save sale: ${error.message}`);
  if (!data) throw new Error('Unable to save sale: missing response.');
  return mapSale(data);
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
    .single().overrideTypes<SellerSaleRow, { merge: false }>();
  if (error) throw new Error(`Unable to update sale: ${error.message}`);
  if (!data) throw new Error('Unable to update sale: missing response.');
  return mapSale(data);
}

export async function deleteSellerSale(saleId: string): Promise<void> {
  const client = await requireSupabase();
  const { error } = await client.from('seller_sales').delete().eq('id', saleId);
  if (error) throw new Error(`Unable to delete sale: ${error.message}`);
}

export async function createSellerOrder(items: SellerSaleInput[], packagingCost: number, shippingCost: number): Promise<void> {
  if (!items.length || items.length > 100) throw new Error('Add between 1 and 100 products to the order.');
  if (![packagingCost,shippingCost].every(cost => Number.isFinite(cost) && cost >= 0 && cost <= 1000000)) {
    throw new Error('Enter valid whole-order costs between 0 and 1,000,000.');
  }
  const values = items.map(item => saleColumns({ ...item,packagingCost: 0,shippingCost: 0 }));
  const client = await requireSupabase();
  const { error } = await client.rpc('create_seller_order',{ p_items: values,p_packaging: packagingCost,p_shipping: shippingCost });
  if (error) throw new Error(`Unable to save order: ${error.message}`);
}

export async function saveSellerOrderCosts(orderId: string, packagingCost: number, shippingCost: number,
  source: 'manual' | 'courier'): Promise<void> {
  if (![packagingCost,shippingCost].every(cost => Number.isFinite(cost) && cost >= 0 && cost <= 1000000)) {
    throw new Error('Enter valid whole-order costs between 0 and 1,000,000.');
  }
  const client = await requireSupabase();
  const { error } = await client.rpc('save_seller_order_costs',{
    p_order_id: orderId,p_packaging: packagingCost,p_shipping: shippingCost,p_source: source,
  });
  if (error) throw new Error(`Unable to save order costs: ${error.message}`);
}

export async function deleteSellerOrder(orderId: string): Promise<void> {
  const client = await requireSupabase();
  const { error } = await client.rpc('delete_seller_order',{ p_order_id: orderId });
  if (error) throw new Error(`Unable to delete order: ${error.message}`);
}
