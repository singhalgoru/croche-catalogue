import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSellerOrder, saveSellerOrderCosts, createSellerSale, fetchSellerSales, updateSellerSale, type SellerSaleInput } from './sellerSales';

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(),rpc: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({
  loadSupabase: async () => ({ from,rpc }),
}));

const sale: SellerSaleInput = {
  productId: 'product-1',
  productName: 'Crochet flower',
  variantName: 'Pink',
  saleDate: '2026-10-06',
  channel: 'online',
  quantity: 2,
  unitPrice: 105,
  gstPercent: 5,
  materialCost: 20,
  labourCost: 10,
  packagingCost: 5,
  shippingCost: 30,
  gatewayFeePercent: 2,
  gatewayFeeGstPercent: 18,
  notes: 'Market order',
};

const row = {
  id: 'sale-1',
  product_id: 'product-1',
  product_name: 'Crochet flower',
  variant_name: 'Pink',
  sale_date: '2026-10-06',
  channel: 'online',
  quantity: 2,
  unit_price: '105.00',
  gst_percent: '5.00',
  material_cost: '20.00',
  labour_cost: '10.00',
  packaging_cost: '5.00',
  shipping_cost: '30.00',
  gateway_fee_percent: '2.00',
  gateway_fee_gst_percent: '18.00',
  notes: 'Market order',
  created_at: '2026-10-06T10:00:00Z',
};

beforeEach(() => { from.mockReset(); rpc.mockReset().mockResolvedValue({ data: 'order',error: null }); });

describe('seller sales persistence', () => {
  it.each(['create', 'update'])('persists zero GST only in the sales ledger on %s', async operation => {
    const query = {
      insert: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(),
      single: vi.fn(),overrideTypes: vi.fn().mockResolvedValue({ data: { ...row, gst_percent: '0.00' }, error: null }),
    };
    query.insert.mockReturnValue(query);
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.single.mockReturnValue(query);
    from.mockReturnValue(query);
    const input = { ...sale, gstPercent: 0 };
    const saved = operation === 'create'
      ? await createSellerSale(input) : await updateSellerSale(row.id, input);
    expect(saved.gstPercent).toBe(0);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('seller_sales');
    expect(operation === 'create' ? query.insert : query.update).toHaveBeenCalledWith(
      expect.objectContaining({ product_id: sale.productId, gst_percent: 0 }),
    );
  });

  it('maps database decimals and sale snapshots when fetching rows', async () => {
    const query = {
      select: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),overrideTypes: vi.fn().mockResolvedValue({ data: [{ ...row,
        labour_time_spent: '30.00', labour_time_unit: 'minutes', labour_rate: '180.00', order: {
        id: 'order',reference: 'LUV-1',payment_order_id: 'payment',packaging_cost: '25.00',shipping_cost: '100.00',
        shipping_collected: '50.00',shipping_source: 'courier',items: [{ quantity: 2,unit_price: '105.00' },{ quantity: 1,unit_price: '200.00' }],
      } }], error: null }),
    };
    query.select.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.range.mockReturnValue(query);
    from.mockReturnValue(query);

    expect(await fetchSellerSales()).toMatchObject([{
      id: 'sale-1',
      productId: 'product-1',
      unitPrice: 105,
      gstPercent: 5,
      materialCost: 20,
      labourTimeSpent: 30,
      labourTimeUnit: 'minutes',
      labourRate: 180,
      channel: 'online',
      order: { id: 'order',packagingCost: 25,shippingCost: 100,shippingCollected: 50,itemRevenue: 410 },
    }]);
    expect(from).toHaveBeenCalledWith('seller_sales');
  });

  it('loads all sales pages so quarterly and yearly totals are not truncated', async () => {
    const query = {
      select: vi.fn(), order: vi.fn(),
      range: vi.fn(),overrideTypes: vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => row), error: null })
        .mockResolvedValueOnce({ data: [row], error: null }),
    };
    query.select.mockReturnValue(query); query.order.mockReturnValue(query);
    query.range.mockReturnValue(query);
    from.mockReturnValue(query);
    expect(await fetchSellerSales()).toHaveLength(501);
    expect(query.range).toHaveBeenNthCalledWith(1, 0, 499);
    expect(query.range).toHaveBeenNthCalledWith(2, 500, 999);
    query.overrideTypes.mockResolvedValueOnce({ data: null, error: { message: 'network failed' } });
    await expect(fetchSellerSales()).rejects.toThrow('network failed');
  });

  it('inserts a validated sale snapshot', async () => {
    const query = {
      insert: vi.fn(),
      select: vi.fn(),
      single: vi.fn(),overrideTypes: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    query.insert.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.single.mockReturnValue(query);
    from.mockReturnValue(query);

    expect(await createSellerSale(sale)).toMatchObject({
      productName: 'Crochet flower',
      unitPrice: 105,
      quantity: 2,
    });
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      product_id: 'product-1',
      product_name: 'Crochet flower',
      unit_price: 105,
      gst_percent: 5,
      shipping_cost: 30,
    }));
  });

  it('rejects invalid sales before any database request', async () => {
    await expect(createSellerSale({ ...sale, quantity: 0 })).rejects.toThrow('Quantity');
    await expect(createSellerSale({ ...sale, channel: 'unknown' as SellerSaleInput['channel'] }))
      .rejects.toThrow('sales channel');
    await expect(createSellerSale({ ...sale, gstPercent: 101 })).rejects.toThrow('cannot exceed');
    for (const labourRate of [-1, Number.NaN, Number.POSITIVE_INFINITY, 10001]) {
      await expect(createSellerSale({ ...sale, labourTimeSpent: 1, labourTimeUnit: 'hours', labourRate })).rejects.toThrow('labour time');
    }
    await expect(createSellerSale({ ...sale, labourRate: 100 })).rejects.toThrow('labour time');
    expect(from).not.toHaveBeenCalled();
  });
  it('stores the effective labour rate and time in each new order line', async () => {
    await createSellerOrder([{ ...sale, labourTimeSpent: 30, labourTimeUnit: 'minutes', labourRate: 180, labourCost: 90 }], 0, 0);
    expect(rpc).toHaveBeenCalledWith('create_seller_order', expect.objectContaining({ p_items: [
      expect.objectContaining({ labour_time_spent: 30, labour_time_unit: 'minutes', labour_rate: 180, labour_cost: 90 }),
    ] }));
  });
  it('creates all order lines atomically with zero item packaging and shipping',async () => {
    await createSellerOrder([sale,{ ...sale,productName: 'Bunny' }],40,125);
    expect(rpc).toHaveBeenCalledWith('create_seller_order',{
      p_packaging: 40,p_shipping: 125,p_items: [
        expect.objectContaining({ product_name: sale.productName,packaging_cost: 0,shipping_cost: 0 }),
        expect.objectContaining({ product_name: 'Bunny',packaging_cost: 0,shipping_cost: 0 }),
      ],
    });
    expect(from).not.toHaveBeenCalled();
  });
  it('saves manual or server-owned courier costs and surfaces persistence errors',async () => {
    await saveSellerOrderCosts('order',25,100,'manual');
    expect(rpc).toHaveBeenCalledWith('save_seller_order_costs',{ p_order_id: 'order',p_packaging: 25,p_shipping: 100,p_source: 'manual' });
    rpc.mockResolvedValueOnce({ error: { message: 'No AWB yet' } });
    await expect(saveSellerOrderCosts('order',25,0,'courier')).rejects.toThrow('No AWB yet');
    await expect(createSellerOrder([],0,0)).rejects.toThrow('Add between');
  });
});
