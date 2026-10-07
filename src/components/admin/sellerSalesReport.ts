import { SALE_CHANNELS, type SaleChannel, type SellerSale, type SellerSaleInput } from '../../services/sellerSales';
import { calculateSaleFinancials, summarizeSellerSales } from './sellerSalesSummary';

const REPORT_HEADERS = [
  'Record ID',
  'Product ID',
  'Product',
  'Variant',
  'Sale Date',
  'Channel',
  'Quantity',
  'Unit Selling Price',
  'GST Rate',
  'Material Cost Per Piece',
  'Labour Cost Per Piece',
  'Packaging Cost Per Piece',
  'Shipping Cost',
  'Payment Fee Rate',
  'GST On Payment Fee',
  'Notes',
  'Revenue',
  'GST Included',
  'Payment Fees',
  'Total Costs',
  'Estimated Profit',
  'Margin Percent',
] as const;

const csvCell = (value: string | number) => {
  const raw = String(value);
  const text = typeof value === 'string' && /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const csvRecord = (values: Array<string | number>) => values.map(csvCell).join(',');

export const buildSellerSalesCsv = (month: string, sales: SellerSale[]) => {
  const monthly = sales.filter((sale) => sale.saleDate.startsWith(`${month}-`));
  const records = monthly.map((sale) => {
    const financials = calculateSaleFinancials(sale);
    return csvRecord([
      sale.id,
      sale.productId ?? '',
      sale.productName,
      sale.variantName,
      sale.saleDate,
      sale.channel,
      sale.quantity,
      sale.unitPrice,
      sale.gstPercent,
      sale.materialCost,
      sale.labourCost,
      sale.packagingCost,
      sale.shippingCost,
      sale.gatewayFeePercent,
      sale.gatewayFeeGstPercent,
      sale.notes,
      financials.revenue.toFixed(2),
      financials.gst.toFixed(2),
      financials.gatewayFee.toFixed(2),
      financials.costs.toFixed(2),
      financials.profit.toFixed(2),
      financials.marginPercent?.toFixed(2) ?? '',
    ]);
  });
  const summary = summarizeSellerSales(monthly);
  return [
    csvRecord([...REPORT_HEADERS]),
    ...records,
    csvRecord([
      'MONTH TOTAL',
      '',
      `${month} · ${summary.salesCount} sales · ${summary.piecesSold} pieces`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      summary.revenue.toFixed(2),
      summary.gst.toFixed(2),
      summary.gatewayFee.toFixed(2),
      summary.costs.toFixed(2),
      summary.profit.toFixed(2),
      summary.marginPercent?.toFixed(2) ?? '',
    ]),
  ].join('\r\n');
};

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
};

const channelSet = new Set<string>(SALE_CHANNELS);

const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

export interface ParsedSalesImport {
  sales: SellerSaleInput[];
  existingIds: Array<string | null>;
}

export const parseSellerSalesCsv = (
  text: string,
  month: string,
  validProductIds: Set<string>,
): ParsedSalesImport => {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The CSV must contain a header row and at least one sale.');
  if (rows.length > 1001) throw new Error('Import at most 1,000 sales per file.');
  const headers = rows[0].map((value) => value.trim().toLocaleLowerCase());
  const requiredHeaders = REPORT_HEADERS.slice(0, 16).map((header) => header.toLocaleLowerCase());
  const headerIndexes = requiredHeaders.map((header) => headers.indexOf(header));
  if (headerIndexes.some((index) => index < 0)) {
    throw new Error('This report is missing required columns. Download the monthly report/template and keep its column headers.');
  }

  const sales: SellerSaleInput[] = [];
  const existingIds: Array<string | null> = [];
  const seenIds = new Set<string>();
  const errors: string[] = [];
  rows.slice(1).forEach((row, rowIndex) => {
    const lineNumber = rowIndex + 2;
    const values = headerIndexes.map((column) => row[column]?.trim() ?? '');
    const [recordId, productId, productName, variantName, saleDate, channelValue,
      quantityValue, unitPriceValue, gstValue, materialValue, labourValue, packagingValue,
      shippingValue, feeValue, feeGstValue, notes] = values;
    if (recordId.toLocaleUpperCase() === 'MONTH TOTAL') return;
    const invalid: string[] = [];
    const channel = channelValue.toLocaleLowerCase();
    if (!productName || productName.length > 150) invalid.push('product name');
    if (!isValidDate(saleDate) || !saleDate.startsWith(`${month}-`)) {
      invalid.push(`sale date in ${month}`);
    }
    if (!channelSet.has(channel)) invalid.push('sales channel');
    const quantity = Number(quantityValue);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) invalid.push('quantity');
    const numeric = [
      unitPriceValue, gstValue, materialValue, labourValue, packagingValue,
      shippingValue, feeValue, feeGstValue,
    ].map(Number);
    if (numeric.some((value) => !Number.isFinite(value) || value < 0)) invalid.push('non-negative prices/rates/costs');
    if (numeric[0] <= 0) invalid.push('unit selling price greater than zero');
    if (numeric[1] > 100 || numeric[6] > 100 || numeric[7] > 100) invalid.push('tax/fee rates no greater than 100%');
    if (variantName.length > 100 || notes.length > 1000) invalid.push('variant/notes length');
    if (invalid.length > 0) {
      errors.push(`Row ${lineNumber}: invalid ${invalid.join(', ')}.`);
      return;
    }
    const normalizedId = recordId || null;
    if (normalizedId && seenIds.has(normalizedId)) {
      errors.push(`Row ${lineNumber}: duplicate record ID "${normalizedId}".`);
      return;
    }
    if (normalizedId) seenIds.add(normalizedId);
    sales.push({
      productId: validProductIds.has(productId) ? productId : null,
      productName,
      variantName,
      saleDate,
      channel: channel as SaleChannel,
      quantity,
      unitPrice: numeric[0],
      gstPercent: numeric[1],
      materialCost: numeric[2],
      labourCost: numeric[3],
      packagingCost: numeric[4],
      shippingCost: numeric[5],
      gatewayFeePercent: numeric[6],
      gatewayFeeGstPercent: numeric[7],
      notes,
    });
    existingIds.push(normalizedId);
  });
  if (errors.length > 0) {
    throw new Error(`Import cancelled; no rows were saved.\n${errors.slice(0, 8).join('\n')}${errors.length > 8 ? `\n…and ${errors.length - 8} more row errors.` : ''}`);
  }
  if (sales.length === 0) throw new Error('No sale rows were found in the selected month.');
  return { sales, existingIds };
};
