import { allPaymentHeaders, artisanPaymentLabel } from './financialLedgerCsv';

export async function buildArtisanPaymentWorkbook(artisans: { id: string; name: string }[]) {
  if (!artisans.length) throw new Error('No artisans are available for the payment template.');
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const payments = workbook.addWorksheet('Payments');
  const names = workbook.addWorksheet('Artisans');
  payments.addRow(allPaymentHeaders);
  names.addRow(['Choose from these artisans in the Payments sheet']);
  artisans.forEach(artisan => names.addRow([artisanPaymentLabel(artisan)]));
  workbook.definedNames.add(`'Artisans'!$A$2:$A$${artisans.length + 1}`, 'ArtisanChoices');
  payments.columns.forEach(column => { column.width = 24; });
  names.getColumn(1).width = 55;
  for (let row = 2; row <= 1001; row += 1) {
    payments.getCell(row, 1).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['ArtisanChoices'], showErrorMessage: true,
      errorTitle: 'Choose an artisan', error: 'Select an artisan from the list.',
    };
    payments.getCell(row, 3).numFmt = 'yyyy-mm-dd';
    payments.getCell(row, 4).numFmt = '0.00';
  }
  return workbook.xlsx.writeBuffer();
}

export async function downloadArtisanPaymentWorkbook(artisans: { id: string; name: string }[]) {
  const buffer = await buildArtisanPaymentWorkbook(artisans);
  const bytes = new Uint8Array(buffer);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'luvia-all-artisan-payments-template.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}
