import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSellerSale, fetchSellerSales, updateSellerSale, type SellerSaleInput } from './sellerSales';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({
  loadSupabase: async () => ({ from }),
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

beforeEach(() => from.mockReset());

describe('seller sales persistence', () => {
  it.each(['create', 'update'])('persists zero GST only in the sales ledger on %s', async operation => {
    const query = {
      insert: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: { ...row, gst_percent: '0.00' }, error: null }),
    };
    query.insert.mockReturnValue(query);
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.select.mockReturnValue(query);
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
      then: (resolve: (value: { data: typeof row[]; error: null }) => unknown) =>
        Promise.resolve({ data: [row], error: null }).then(resolve),
    };
    query.select.mockReturnValue(query);
    query.order.mockReturnValue(query);
    from.mockReturnValue(query);

    expect(await fetchSellerSales()).toMatchObject([{
      id: 'sale-1',
      productId: 'product-1',
      unitPrice: 105,
      gstPercent: 5,
      materialCost: 20,
      channel: 'online',
    }]);
    expect(from).toHaveBeenCalledWith('seller_sales');
  });

  it('inserts a validated sale snapshot', async () => {
    const query = {
      insert: vi.fn(),
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    query.insert.mockReturnValue(query);
    query.select.mockReturnValue(query);
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
    expect(from).not.toHaveBeenCalled();
  });
});
