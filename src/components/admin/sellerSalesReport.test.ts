import { describe, expect, it } from 'vitest';
import type { SellerSale } from '../../services/sellerSales';
import { buildSellerSalesCsv, parseSellerSalesCsv } from './sellerSalesReport';

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
      notes: 'Gift, packed',
    }]);
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
