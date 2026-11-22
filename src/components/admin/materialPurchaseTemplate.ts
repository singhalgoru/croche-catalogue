import { materialCategories } from '../../services/materialPurchases';
import { localDate } from '../../utils/date';
import { materialTemplateHeaders } from './financialLedgerCsv';
import { TEMPLATE_EXAMPLE } from './sellerSalesReport';

export async function buildMaterialWorkbook() {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Purchases');
  sheet.addRow(materialTemplateHeaders);
  sheet.addRow(['', localDate(), 'Example yarn', 'Example supplier', 2, 'balls', 200, 'Paid', TEMPLATE_EXAMPLE, 'Yarn']);
  sheet.columns.forEach(column => { column.width = 24; });
  for (let row = 2; row <= 1001; row += 1) {
    sheet.getCell(row, 10).dataValidation = { type: 'list', allowBlank: true,
      formulae: [`"${materialCategories.join(',')}"`], showErrorMessage: true,
      error: 'Choose a category from the list.' };
    sheet.getCell(row, 2).numFmt = 'yyyy-mm-dd';
  }
  return workbook.xlsx.writeBuffer();
}

export async function downloadMaterialWorkbook() {
  const buffer = await buildMaterialWorkbook();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'luvia-material-purchases-template.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}
