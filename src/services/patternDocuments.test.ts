import { expect, it } from 'vitest';
import { patternBlocks, patternLabels, pdfPatternBlocks, preparePatternDocuments, protectedPdfDefinition } from './patternDocuments';

const product = { id: 'existing-product-id', sku: 'LUV-000001', name: 'Lotus Flower Decor', image: '/lotus.jpg' };

it('omits the imported Word document title without removing introductory notes or section headings', () => {
  const html = '<p class="pattern-document-title">Crochet Lotus Flower</p><p>Written pattern (US terms)</p>'
    + '<h1>1. Instructions</h1><p>R1: 10 hdc.</p>';
  expect(patternBlocks(html, product)).toEqual([
    { kind: 'text', text: 'Written pattern (US terms)' },
    { kind: 'heading', text: '1. Instructions' }, { kind: 'text', text: 'R1: 10 hdc.' },
  ]);
  expect(patternBlocks(html)[0]).toEqual({ kind: 'text', text: 'Crochet Lotus Flower' });
});

it('omits internal pattern IDs and imported preparers in both languages while retaining revision, date and instructions', () => {
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
      ['Revision / date', 'V2 / 2026-11-18'],
      ['संस्करण / तिथि', 'V2 / 2026-11-18'],
      ['R1', '5 चेन बनाएं।'],
    ].map(row => row.map(text => ({ text, columnSpan: 1 }))) },
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
it('omits only the standard imported copyright already supplied by the generated document', () => {
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
  await expect(preparePatternDocuments(product, 'en',
    `Pattern ID: OLD-ID\nPrepared by: Someone\nReviewed by: Reviewer\n${patternLabels.en.copyright}`))
    .rejects.toThrow('Add pattern instructions');
});
it('preserves revision/date suffixes in paragraphs without repeating cover fields', () => {
  expect(patternBlocks(`<p>Pattern ID / revision / date: OLD-ID / V3 / 18/11/2026</p>
    <p>Prepared by / date: Someone / 18/11/2026</p><p>Pattern ID: OLD-ID</p>
    <p>Prepared by: Someone</p><p>R1: 10 hdc.</p>`, product)).toEqual([
    { kind: 'text', text: 'Revision / date: V3 / 18/11/2026' },
    { kind: 'text', text: 'Date: 18/11/2026' },
    { kind: 'text', text: 'R1: 10 hdc.' },
  ]);
});
it('omits redundant product-photo/link prompts and separate reviewer fields without removing real reference notes', () => {
  expect(patternBlocks(`<p>Product link: [Paste the product page URL]</p>
    <p>[Insert this product's main photo]</p><p>[Insert approved product photos and colour references here.]</p>
    <p>उत्पाद का लिंक: [उत्पाद के पेज का URL लिखें]</p><p>[उत्पाद की मुख्य तस्वीर जोड़ें]</p>
    <p>Reviewed by: Reviewer</p><p>तैयार किया / समीक्षा की: Someone / Reviewer</p>
    <table><tr><td>Prepared by / reviewed by</td><td>Someone / Reviewer</td></tr>
    <tr><td>Reviewed by</td><td>Reviewer</td></tr><tr><td>R1</td><td>10 hdc</td></tr></table>
    <p>Reference photo: use pale pink for the outer layer.</p>`, product)).toEqual([
    { kind: 'table', rows: [
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
it('formats reference/construction notes as a table without changing their technical wording', () => {
  expect(patternBlocks(`<h2>1. Reference &amp; construction</h2><p>Work in rounds. Do not turn.</p>
    <p>Light pink: R4-R8.</p><h2>2. Materials</h2><p>Cotton yarn.</p>`, product)).toEqual([
    { kind: 'heading', text: '1. Reference & construction' },
    { kind: 'table', rows: [
      [{ text: 'Construction details', columnSpan: 1 }],
      [{ text: 'Work in rounds. Do not turn.', columnSpan: 1 }],
      [{ text: 'Light pink: R4-R8.', columnSpan: 1 }],
    ] },
    { kind: 'heading', text: '2. Materials' }, { kind: 'text', text: 'Cotton yarn.' },
  ]);
});
it('omits empty PDF details and sections but retains filled values, dates and real bracketed stitch instructions', () => {
  const blocks = patternBlocks(`<table><tr><td>Document control</td><td>Details</td></tr>
    <tr><td>Finished size / tolerance</td><td>[Dimensions in cm] / [Allowed variation]</td></tr>
    <tr><td>Skill level / terminology</td><td>[Beginner / Intermediate / Advanced] / US crochet terms</td></tr>
    <tr><td>Revision / date</td><td>V3 / 18/11/2026</td></tr>
    <tr><td>Yarn</td><td>[Cotton]</td></tr></table>
    <h2>Empty section</h2><p>[Add measurements here.]</p>
    <h2>Instructions</h2><p>R1: [sc, ch 2, dc] x 8. [Add 2 dc] in the next loop. See [R2].</p>`, product);
  expect(pdfPatternBlocks(blocks)).toEqual([
    { kind: 'table', rows: [
      ['Pattern details', 'Details'], ['Skill level / terminology', 'US crochet terms'],
      ['Revision / date', 'V3 / 18/11/2026'], ['Yarn', '[Cotton]'],
    ].map(row => row.map(text => ({ text, columnSpan: 1 }))) },
    { kind: 'heading', text: 'Instructions' },
    { kind: 'text', text: 'R1: [sc, ch 2, dc] x 8. [Add 2 dc] in the next loop. See [R2].' },
  ]);
  expect(blocks[0]).toMatchObject({ rows: expect.arrayContaining([
    [{ text: 'Finished size / tolerance', columnSpan: 1 }, { text: '[Dimensions in cm] / [Allowed variation]', columnSpan: 1 }],
  ]) });
});
it('omits all-placeholder tables, Hindi fields and empty headings from the PDF', () => {
  expect(pdfPatternBlocks(patternBlocks(`<h2>Sample approval</h2>
    <table><tr><td>Check</td><td>Notes</td></tr><tr><td>Size</td><td>[Match approved sample and agreed tolerance]</td></tr></table>
    <h2>माप</h2><p>[सेमी में माप]</p>`, product))).toEqual([]);
});
it('rejects PDF creation when no filled pattern content remains', async () => {
  await expect(preparePatternDocuments(product, 'en', '[Write full instructions]'))
    .rejects.toThrow('Fill in pattern instructions');
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
  if (typeof first.footer !== 'function') throw new Error('Expected the last-page footer');
  expect(JSON.stringify(first.footer(1, 2, { width: 595, height: 842, orientation: 'portrait' }))).not.toContain(patternLabels.hi.copyright);
  expect(JSON.stringify(first.footer(2, 2, { width: 595, height: 842, orientation: 'portrait' }))).toContain(patternLabels.hi.copyright);
});
