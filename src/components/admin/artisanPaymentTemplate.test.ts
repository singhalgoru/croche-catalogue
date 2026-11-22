import { expect, it } from 'vitest';
import { Workbook } from 'exceljs';
import { buildArtisanPaymentWorkbook } from './artisanPaymentTemplate';
import { parseAllPaymentCsv } from './financialLedgerCsv';

it('creates an Excel dropdown linked to artisan IDs and supports a completed CSV', async () => {
  const artisans = [{ id: 'one', name: 'Maker' }, { id: 'two', name: 'Maker' }];
  const buffer = await buildArtisanPaymentWorkbook(artisans);
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Payments')!;
  expect(workbook.getWorksheet('Artisans')?.getCell('A3').value).toBe('Maker [two]');
  expect(workbook.definedNames.getRanges('ArtisanChoices').ranges).toContain('Artisans!$A$2:$A$3');
  expect(sheet.getCell('A2').dataValidation).toMatchObject({ type: 'list', formulae: ['ArtisanChoices'] });
  expect(sheet.getCell('C2').numFmt).toBe('yyyy-mm-dd');
  expect(sheet.getCell('A2').value).toBe('Maker [one]');
  const example = (await workbook.csv.writeBuffer({ sheetName: 'Payments' })).toString();
  expect(() => parseAllPaymentCsv(example, artisans.map(artisan => ({ ...artisan, payments: [] })), new Map()))
    .toThrow(/Row 2: replace or delete the example row/);
  sheet.getRow(2).values = ['Maker [two]', '', '2025-03-31', 100, 'Cash', '', 'Flowers', 'Recorded', ''];
  const csv = (await workbook.csv.writeBuffer({ sheetName: 'Payments' })).toString();
  expect(parseAllPaymentCsv(csv, artisans.map(artisan => ({ ...artisan, payments: [] })), new Map())[0])
    .toMatchObject({ artisanId: 'two', input: { method: 'Cash', description: 'Flowers' } });
});
