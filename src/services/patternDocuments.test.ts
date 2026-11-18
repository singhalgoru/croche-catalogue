import { expect, it } from 'vitest';
import { patternBlocks, patternLabels, productPatternId, protectedPdfDefinition } from './patternDocuments';

const product = { id: 'existing-product-id', sku: 'LUV-000001', name: 'Lotus Flower Decor', image: '/lotus.jpg' };

it('uses the product name and permanent SKU, with the full product ID for older products without SKUs', () => {
  expect(productPatternId(product)).toBe('Lotus Flower Decor-LUV-000001');
  expect(productPatternId({ ...product, name: 'कमल का फूल' })).toBe('कमल का फूल-LUV-000001');
  expect(productPatternId({ ...product, sku: undefined })).toBe('Lotus Flower Decor-existing-product-id');
});

it('replaces imported identity fields in both languages without changing review, revision or instruction fields', () => {
  expect(patternBlocks(`<table>
    <tr><td>Product / SKU</td><td>[Enter product and SKU]</td></tr>
    <tr><td>Pattern ID / revision / date</td><td>OLD-ID / V2 / 2026-11-18</td></tr>
    <tr><td>Prepared by / reviewed by</td><td>Other company / Reviewer</td></tr>
    <tr><td>पैटर्न ID / संस्करण / तिथि</td><td>पुराना / V2 / 2026-11-18</td></tr>
    <tr><td>तैयार किया / समीक्षा की</td><td>[नाम] / समीक्षक</td></tr>
    <tr><td>R1</td><td>5 चेन बनाएं।</td></tr></table>
    <p>Prepared by: Other company</p><p>पैटर्न ID: पुराना</p>`, product)).toEqual([
    { kind: 'table', rows: [
      ['Product / SKU', 'Lotus Flower Decor / LUV-000001'],
      ['Pattern ID / revision / date', 'Lotus Flower Decor-LUV-000001 / V2 / 2026-11-18'],
      ['Prepared by / reviewed by', 'Luvia Creations / Reviewer'],
      ['पैटर्न ID / संस्करण / तिथि', 'Lotus Flower Decor-LUV-000001 / V2 / 2026-11-18'],
      ['तैयार किया / समीक्षा की', 'Luvia Creations / समीक्षक'],
      ['R1', '5 चेन बनाएं।'],
    ] }, { kind: 'text', text: 'Prepared by: Luvia Creations' },
    { kind: 'text', text: 'पैटर्न ID: Lotus Flower Decor-LUV-000001' },
  ]);
});

it('retains Hindi instructions, round notation, tables and embedded diagrams in the authoring model', () => {
  expect(patternBlocks('<h2>निर्देश</h2><p>R1: 5 चेन बनाएं।</p><table><tr><td>राउंड</td><td>गिनती</td></tr></table>'))
    .toEqual([{ kind: 'heading', text: 'निर्देश' }, { kind: 'text', text: 'R1: 5 चेन बनाएं।' },
      { kind: 'table', rows: [['राउंड', 'गिनती']] }]);
  expect(() => patternBlocks('<p><img src="https://untrusted.test/image.png"></p>')).toThrow('embedded');
  expect(() => patternBlocks('<table><tr><td><img src="data:image/png;base64,abc"></td></tr></table>')).toThrow('table cells');
});
it('uses AES-256 and permits only high-quality printing, with a different owner password for each preparation', () => {
  const first = protectedPdfDefinition('hi', []);
  const second = protectedPdfDefinition('hi', []);
  expect(first.version).toBe('1.7ext3');
  expect(first.ownerPassword).not.toBe(second.ownerPassword);
  expect(first.userPassword).toBeUndefined();
  expect(first.permissions).toEqual({ printing: 'highResolution', modifying: false, copying: false,
    annotating: false, fillingForms: false, contentAccessibility: false, documentAssembly: false });
  expect(first.defaultStyle?.font).toBe('NotoDevanagari');
  expect(patternLabels.hi.copyright).toContain('स्पष्ट लिखित अनुमति');
  expect(patternLabels.en.copyright).toContain('explicit written consent');
});
