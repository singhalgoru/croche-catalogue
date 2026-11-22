import { describe, expect, it } from 'vitest';
import type { SellerSale } from '../../services/sellerSales';
import { buildSellerSalesCsv, buildSellerSalesTemplate, parseSellerSalesCsv } from './sellerSalesReport';

const sale: SellerSale = {
  id: 'sale-1',
  productId: 'product-1',
  productName: 'Crochet, "Rose"',
  variantName: 'Pink',
  saleDate: '2026-10-06',
  channel: 'online',
  quantity: 2,
  unitPrice: 100,
  gstPercent: 5,
  materialCost: 20,
  labourCost: 10,
  packagingCost: 5,
  shippingCost: 30,
  gatewayFeePercent: 2,
  gatewayFeeGstPercent: 18,
  notes: 'Gift, packed',
  createdAt: '2026-10-06T10:00:00Z',
};

describe('seller sales report CSV', () => {
  it('accepts a filled blank sales template including planning allocations', () => {
    const csv = `${buildSellerSalesTemplate()}\r\n,,Rose,,2026-10-06,offline,2,100,5,20,10,5,30,0,18,,15,4,5`;
    const parsed = parseSellerSalesCsv(csv, '2026-10', new Set());
    expect(parsed.sales[0]).toMatchObject({ productName: 'Rose', saleDate: '2026-10-06', channel: 'offline',
      quantity: 2, marketingPercent: 15, returnsReservePercent: 4, overheadPercent: 5 });
    expect(parsed.existingIds).toEqual([null]);
    expect(() => parseSellerSalesCsv(buildSellerSalesTemplate(), '2026-10', new Set())).toThrow(/at least one sale/);
  });
  it('round-trips saved labour time and rate and rejects partial calculations', () => {
    const csv = buildSellerSalesCsv('2026-10', [{ ...sale, labourTimeSpent: 30, labourTimeUnit: 'minutes', labourRate: 180 }]);
    expect(parseSellerSalesCsv(csv, '2026-10', new Set(['product-1'])).sales[0]).toMatchObject({
      labourTimeSpent: 30, labourTimeUnit: 'minutes', labourRate: 180, labourCost: 10,
    });
    expect(() => parseSellerSalesCsv(csv.replace(',30,minutes,180', ',30,minutes,'), '2026-10', new Set())).toThrow('labour time');
    const legacy = csv.split('\r\n').map(line => line.split(',').slice(0, -12).join(',')).join('\r\n');
    expect(parseSellerSalesCsv(legacy, '2026-10', new Set()).sales[0].labourCost).toBe(10);
    expect(parseSellerSalesCsv(legacy, '2026-10', new Set()).sales[0].labourRate).toBeUndefined();
  });
  it('exports shared order context with zero item charges and matching allocated totals', () => {
    const order = { id: 'order',reference: 'LUV-ORDER',paymentOrderId: 'payment',packagingCost: 25,shippingCost: 100,
      shippingCollected: 50,shippingSource: 'courier' as const,itemRevenue: 400 };
    const csv = buildSellerSalesCsv('2026-10',[
      { ...sale,order,packagingCost: 0,shippingCost: 0 },
      { ...sale,id: 'second',order,packagingCost: 0,shippingCost: 0 },
    ]);
    const parsed = parseSellerSalesCsv(csv,'2026-10',new Set(['product-1']));
    expect(parsed.orderIds).toEqual(['order','order']);
    expect(parsed.sales.every(item => item.shippingCost === 0 && item.packagingCost === 0)).toBe(true);
    expect(csv).toContain('Order Packaging Cost');
    expect(csv).toContain('LUV-ORDER,25,100,courier,50');
    expect(csv).toContain('1 sales · 4 pieces');
  });
  it('exports only the selected month with its summary and round-trips sale inputs', () => {
    const csv = buildSellerSalesCsv('2026-10', [
      sale,
      { ...sale, id: 'sale-2', saleDate: '2026-09-30' },
    ]);
    expect(csv).toContain('MONTH TOTAL');
    expect(csv).toContain('06/10/2026');
    expect(csv).toContain('Crochet, ""Rose""');
    expect(csv).not.toContain('2026-09-30');

    const imported = parseSellerSalesCsv(csv, '2026-10', new Set(['product-1']));
    expect(imported.existingIds).toEqual(['sale-1']);
    expect(imported.sales).toEqual([{
      productId: 'product-1',
      productName: sale.productName,
      variantName: 'Pink',
      saleDate: '2026-10-06',
      channel: 'online',
      quantity: 2,
      unitPrice: 100,
      gstPercent: 5,
      materialCost: 20,
      labourCost: 10,
      packagingCost: 5,
      shippingCost: 30,
      gatewayFeePercent: 2,
      gatewayFeeGstPercent: 18,
      marketingPercent: 0,
      returnsReservePercent: 0,
      overheadPercent: 0,
      notes: 'Gift, packed',
    }]);
  });

  it('round-trips allocation percentages, exports aligned totals, and preserves missing legacy rates', () => {
    const csv = buildSellerSalesCsv('2026-10', [{
      ...sale, productName: 'Rose', notes: '', marketingPercent: 15, returnsReservePercent: 4, overheadPercent: 0,
    }]);
    expect(parseSellerSalesCsv(csv, '2026-10', new Set()).sales[0]).toMatchObject({
      marketingPercent: 15, returnsReservePercent: 4, overheadPercent: 0,
    });
    const rows = csv.split('\r\n').map(line => line.split(','));
    expect(rows.every(row => row.length === 40)).toBe(true);
    expect(Number(rows[2][37])).toBeCloseTo(200 / 1.05 * 0.19, 2);
    const legacy = rows.map(row => row.slice(0, -9).join(',')).join('\r\n');
    const input = parseSellerSalesCsv(legacy, '2026-10', new Set()).sales[0];
    expect(input.marketingPercent).toBeUndefined();
    expect(input.returnsReservePercent).toBeUndefined();
    expect(input.overheadPercent).toBeUndefined();
    expect(() => parseSellerSalesCsv(csv.replace(',15,4,0,', ',101,4,0,'), '2026-10', new Set()))
      .toThrow('marketing allocation percent');
  });

  it('rejects malformed rows and records outside the selected month before saving any rows', () => {
    const csv = buildSellerSalesCsv('2026-10', [sale]).replace('06/10/2026', '30/09/2026');
    expect(() => parseSellerSalesCsv(csv, '2026-10', new Set(['product-1'])))
      .toThrow('Import cancelled; no rows were saved');
  });

  it('rejects duplicate record IDs in one uploaded file', () => {
    const csv = buildSellerSalesCsv('2026-10', [sale, { ...sale, id: 'sale-1' }]);
    expect(() => parseSellerSalesCsv(csv, '2026-10', new Set(['product-1'])))
      .toThrow('duplicate record ID');
  });

  it('continues to import older reports with ISO dates', () => {
    const csv = buildSellerSalesCsv('2026-10', [sale]).replace('06/10/2026', '2026-10-06');
    expect(parseSellerSalesCsv(csv, '2026-10', new Set(['product-1'])).sales[0].saleDate)
      .toBe('2026-10-06');
  });

  it('neutralizes formula-like text when exporting for spreadsheet applications', () => {
    const csv = buildSellerSalesCsv('2026-10', [{
      ...sale,
      productName: '=HYPERLINK("https://example.invalid","click")',
      notes: '+SUM(1,2)',
    }]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+SUM");
  });
});
