import { expect, it } from 'vitest';
import { patternBlocks, patternLabels, preparePatternDocuments, productPatternId, protectedPdfDefinition } from './patternDocuments';

const product = { id: 'existing-product-id', sku: 'LUV-000001', name: 'Lotus Flower Decor', image: '/lotus.jpg' };

it('uses the product name and permanent SKU, with the full product ID for older products without SKUs', () => {
  expect(productPatternId(product)).toBe('Lotus Flower Decor-LUV-000001');
  expect(productPatternId({ ...product, name: 'कमल का फूल' })).toBe('कमल का फूल-LUV-000001');
  expect(productPatternId({ ...product, sku: undefined })).toBe('Lotus Flower Decor-existing-product-id');
});

it('replaces imported identity fields in both languages, omits reviewed-by fields and retains revision and instructions', () => {
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
      ['Prepared by', 'Luvia Creations'],
      ['पैटर्न ID / संस्करण / तिथि', 'Lotus Flower Decor-LUV-000001 / V2 / 2026-11-18'],
      ['तैयार किया', 'Luvia Creations'],
      ['R1', '5 चेन बनाएं।'],
    ].map(row => row.map(text => ({ text, columnSpan: 1 }))) }, { kind: 'text', text: 'Prepared by: Luvia Creations' },
    { kind: 'text', text: 'पैटर्न ID: Lotus Flower Decor-LUV-000001' },
  ]);
});

it('retains Hindi instructions, round notation, tables and embedded diagrams in the authoring model', () => {
  expect(patternBlocks('<h2>निर्देश</h2><p>R1: 5 चेन बनाएं।</p><table><tr><td>राउंड</td><td>गिनती</td></tr></table>'))
    .toEqual([{ kind: 'heading', text: 'निर्देश' }, { kind: 'text', text: 'R1: 5 चेन बनाएं।' },
      { kind: 'table', rows: [[{ text: 'राउंड', columnSpan: 1 }, { text: 'गिनती', columnSpan: 1 }]] }]);
  expect(() => patternBlocks('<p><img src="https://untrusted.test/image.png"></p>')).toThrow('embedded');
  expect(() => patternBlocks('<table><tr><td><img src="data:image/png;base64,abc"></td></tr></table>')).toThrow('table cells');
});
it('retains full-width section headings and partial horizontal merges using their actual column spans', () => {
  expect(patternBlocks(`<table><tr><th colspan="3">Lotus rounds</th></tr>
    <tr><td>Round</td><td>Instructions</td><td>Count</td></tr>
    <tr><td colspan="3">Centre - Yellow</td></tr>
    <tr><td>R1</td><td>Work into the ring.</td><td>10 hdc</td></tr>
    <tr><td colspan="2">Petal rounds</td><td>8 petals</td></tr></table>`)).toEqual([
    { kind: 'table', rows: [
      [{ text: 'Lotus rounds', columnSpan: 3 }],
      [{ text: 'Round', columnSpan: 1 }, { text: 'Instructions', columnSpan: 1 }, { text: 'Count', columnSpan: 1 }],
      [{ text: 'Centre - Yellow', columnSpan: 3 }],
      [{ text: 'R1', columnSpan: 1 }, { text: 'Work into the ring.', columnSpan: 1 }, { text: '10 hdc', columnSpan: 1 }],
      [{ text: 'Petal rounds', columnSpan: 2 }, { text: '8 petals', columnSpan: 1 }],
    ] },
  ]);
});
it('rejects vertical merges and uneven logical table widths explicitly instead of dropping cells', () => {
  expect(() => patternBlocks('<table><tr><td rowspan="2">Round</td><td>R1</td></tr><tr><td>R2</td></tr></table>'))
    .toThrow('Unmerge vertically merged table cells');
  expect(() => patternBlocks('<table><tr><td colspan="3">Heading</td></tr><tr><td>R1</td><td>Count</td></tr></table>'))
    .toThrow('same total number of columns');
});
it('preserves paragraph, list and manual line breaks without separating inline stitch notation', () => {
  expect(patternBlocks(`<table><tr><td>R5</td><td><p>Sc in the <strong>first</strong> loop.</p>
    <p>Petal: sc, hdc, 2 dc.<br>Repeat.</p><ul><li>Join.</li><li>Cut yarn.</li></ul></td></tr></table>
    <p>R6: ch <strong>4</strong>,<br>turn.</p>`)).toEqual([
    { kind: 'table', rows: [[{ text: 'R5', columnSpan: 1 },
      { text: 'Sc in the first loop.\nPetal: sc, hdc, 2 dc.\nRepeat.\nJoin.\nCut yarn.', columnSpan: 1 }]] },
    { kind: 'text', text: 'R6: ch 4,\nturn.' },
  ]);
});
it('omits only the standard imported copyright already supplied by the generated cover', () => {
  const html = `<p>${patternLabels.en.copyright.replace('©', '(c)')}</p>
    <p>${patternLabels.hi.copyright}</p><p>Custom copyright and review notes.</p>
    <h2>5. Instructions</h2><p>R1: 10 hdc.</p>`;
  expect(patternBlocks(html, product)).toEqual([
    { kind: 'text', text: 'Custom copyright and review notes.' },
    { kind: 'heading', text: '5. Instructions' }, { kind: 'text', text: 'R1: 10 hdc.' },
  ]);
  expect(patternBlocks(`<p>${patternLabels.en.copyright}</p>`)).toHaveLength(1);
});
it('imports only the remaining author-supplied sections without adding template sections', () => {
  expect(patternBlocks('<h2>Instructions</h2><p>R1: 10 hdc.</p>', product)).toEqual([
    { kind: 'heading', text: 'Instructions' }, { kind: 'text', text: 'R1: 10 hdc.' },
  ]);
});
it('does not prepare a cover-only document when every directly authored line is omitted boilerplate', async () => {
  await expect(preparePatternDocuments(product, 'en', `Reviewed by: Reviewer\n${patternLabels.en.copyright}`))
    .rejects.toThrow('Add pattern instructions');
});
it('omits redundant product-photo/link prompts and separate reviewer fields without removing real reference notes', () => {
  expect(patternBlocks(`<p>Product link: [Paste the product page URL]</p>
    <p>[Insert this product's main photo]</p><p>[Insert approved product photos and colour references here.]</p>
    <p>उत्पाद का लिंक: [उत्पाद के पेज का URL लिखें]</p><p>[उत्पाद की मुख्य तस्वीर जोड़ें]</p>
    <p>Reviewed by: Reviewer</p><p>तैयार किया / समीक्षा की: Someone / Reviewer</p>
    <table><tr><td>Prepared by / reviewed by</td><td>Someone / Reviewer</td></tr>
    <tr><td>Reviewed by</td><td>Reviewer</td></tr><tr><td>R1</td><td>10 hdc</td></tr></table>
    <p>Reference photo: use pale pink for the outer layer.</p>`, product)).toEqual([
    { kind: 'text', text: 'तैयार किया: Luvia Creations' },
    { kind: 'table', rows: [
      [{ text: 'Prepared by', columnSpan: 1 }, { text: 'Luvia Creations', columnSpan: 1 }],
      [{ text: 'R1', columnSpan: 1 }, { text: '10 hdc', columnSpan: 1 }],
    ] },
    { kind: 'text', text: 'Reference photo: use pale pink for the outer layer.' },
  ]);
});
it('formats abbreviation definitions as a table and leaves other sections and existing tables alone', () => {
  expect(patternBlocks(`<h2>3. Abbreviations &amp; special stitches</h2>
    <p>US terms: ch = chain; sl st = slip stitch;</p><p>Ch 3 Picot = ch 3; join into the third chain.</p>
    <h2>4. Before you begin</h2><p>Gauge = confirm with your sample.</p>`, product)).toEqual([
    { kind: 'heading', text: '3. Abbreviations & special stitches' }, { kind: 'text', text: 'US terms:' },
    { kind: 'table', rows: [
      ['Abbreviation / stitch', 'Meaning / instructions'], ['ch', 'chain'], ['sl st', 'slip stitch'],
      ['Ch 3 Picot', 'ch 3; join into the third chain.'],
    ].map(row => row.map(text => ({ text, columnSpan: 1 }))) },
    { kind: 'heading', text: '4. Before you begin' }, { kind: 'text', text: 'Gauge = confirm with your sample.' },
  ]);
  const html = '<h2>3. Abbreviations &amp; special stitches</h2><table><tr><td>ch</td><td>chain</td></tr></table>';
  expect(patternBlocks(html, product).filter(block => block.kind === 'table')).toHaveLength(1);
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
