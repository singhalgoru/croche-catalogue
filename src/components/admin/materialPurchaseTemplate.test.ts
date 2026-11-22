import { Workbook } from 'exceljs';
import { expect, it } from 'vitest';
import { buildMaterialWorkbook } from './materialPurchaseTemplate';
import { parseMaterialCsv } from './financialLedgerCsv';

it('provides a category dropdown and blocks the example until it is replaced', async () => {
  const workbook = new Workbook();
  await workbook.xlsx.load(await buildMaterialWorkbook());
  const sheet = workbook.getWorksheet('Purchases')!;
  expect(sheet.getCell('J2').dataValidation).toMatchObject({
    type: 'list', formulae: ['"Yarn,Tool,Accessories,Uncategorized"'],
  });
  let csv = (await workbook.csv.writeBuffer({ sheetName: 'Purchases' })).toString();
  expect(() => parseMaterialCsv(csv, [], new Map())).toThrow(/replace or delete the example row/);
  sheet.getCell('I2').value = 'Real purchase';
  sheet.getCell('J2').value = 'Tool';
  csv = (await workbook.csv.writeBuffer({ sheetName: 'Purchases' })).toString();
  expect(parseMaterialCsv(csv, [], new Map())[0].category).toBe('Tool');
});
