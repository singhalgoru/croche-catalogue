import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { getProductImageUrl } from '../utils/productImageUrl';
import { toProductUrl } from '../utils/productLink';
import { toShareFileName } from '../utils/shareImage';
import type { Product } from '../types/product';
import { Buffer } from 'buffer';

export type PatternLanguage = 'en' | 'hi';
export type PatternProduct = Pick<Product, 'id' | 'name' | 'image' | 'publicSlug' | 'sku'>;
type PatternTableCell = { text: string; columnSpan: number };
type Block = { kind: 'text' | 'heading'; text: string }
  | { kind: 'table'; rows: PatternTableCell[][] } | { kind: 'image'; data: string };
export interface PreparedPattern { word: File; pdf: File; warnings: string[] }
export const patternLabels = {
  en: {
    title: 'Artisan working pattern', link: 'Product page', photo: 'Main product photo',
    preparedBy: 'Prepared by',
    abbreviation: 'Abbreviation / stitch', meaning: 'Meaning / instructions',
    construction: 'Construction details',
    copyright: 'Copyright © Luvia Creations. All rights reserved. Copying, editing, sharing or distributing this document without the prior explicit written consent of Luvia Creations is prohibited, except as permitted by applicable law. Printing for the agreed artisan work is allowed.',
    terms: 'Private working copy. Confirm the sample, quantity, rate, materials and deadline separately before starting production.',
  },
  hi: {
    title: 'कारीगर के लिए क्रोशिया पैटर्न', link: 'उत्पाद का पेज', photo: 'उत्पाद की मुख्य तस्वीर',
    preparedBy: 'तैयार किया',
    abbreviation: 'संक्षिप्त रूप / टांका', meaning: 'अर्थ / निर्देश',
    construction: 'बनावट का विवरण',
    copyright: 'कॉपीराइट © Luvia Creations। सर्वाधिकार सुरक्षित। Luvia Creations की पूर्व स्पष्ट लिखित अनुमति के बिना इस दस्तावेज़ की नकल, संपादन, साझाकरण या वितरण निषिद्ध है, सिवाय लागू कानून द्वारा अनुमत उपयोग के। सहमत कारीगर कार्य के लिए प्रिंट करना अनुमत है।',
    terms: 'निजी कार्य प्रति। काम शुरू करने से पहले नमूना, मात्रा, दर, सामग्री और समय-सीमा पर अलग से सहमति लें।',
  },
};

async function imageData(source: string): Promise<{ data: string; bytes: Uint8Array<ArrayBuffer>; width: number; height: number }> {
  let blob: Blob;
  const embedded = source.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (embedded) {
    blob = new Blob([Uint8Array.from(atob(embedded[2]!), char => char.charCodeAt(0))], { type: embedded[1] });
  } else {
    const response = await fetch(source, { cache: 'reload', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Unable to load pattern image (HTTP ${response.status}).`);
    blob = await response.blob();
  }
  if (!blob.type.startsWith('image/') || blob.size > 10 * 1024 * 1024) throw new Error('Choose a product photo below 10 MB.');
  const bitmap = await createImageBitmap(blob);
  try {
    const ratio = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('This browser cannot prepare pattern images.');
    context.fillStyle = '#fffaf0';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // pdfmake's browser PNG decoder can leave generation pending under our CSP.
    const data = canvas.toDataURL('image/jpeg', 0.95);
    return { data, bytes: Uint8Array.from(atob(data.split(',')[1]!), char => char.charCodeAt(0)),
      width: canvas.width, height: canvas.height };
  } finally { bitmap.close(); }
}

const patternControlLabel = (label: string): string =>
  label.trim().replace(/^(Prepared by|तैयार किया)\s*\/\s*(?:reviewed by|समीक्षा की)$/i, '$1');
const reviewedBy = /^(?:Reviewed by|समीक्षा की)(?:\s*[:：]|$)/i;
const generatedCoverPlaceholders = new Set([
  'Product link: [Paste the product page URL]',
  "[Insert this product's main photo]",
  '[Insert approved product photos and colour references here.]',
  'उत्पाद का लिंक: [उत्पाद के पेज का URL लिखें]',
  '[उत्पाद की मुख्य तस्वीर जोड़ें]',
]);

function generatedPatternText(text: string): boolean {
  const copyright = text.replace(/\(c\)/gi, '©').replace(/\s+/g, ' ');
  return generatedCoverPlaceholders.has(text) || reviewedBy.test(text)
    || Object.values(patternLabels).some(labels => copyright === labels.copyright);
}

function patternControlEntry(label: string, value: string, product: PatternProduct): { label: string; value: string } | null {
  const field = patternControlLabel(label);
  if (reviewedBy.test(field)) return null;
  const coveredField = field.match(/^(?:Pattern ID|Prepared by|पैटर्न ID|तैयार किया)(?:\s*\/\s*(.+))?$/i);
  if (coveredField) {
    const separator = value.indexOf('/');
    if (!coveredField[1] || separator < 0) return null;
    const remainingLabel = coveredField[1].trim();
    if (!remainingLabel) return null;
    return { label: remainingLabel.charAt(0).toUpperCase() + remainingLabel.slice(1),
      value: value.slice(separator + 1).trim() };
  }
  if (/^(?:Product|उत्पाद)\s*\/\s*SKU$/i.test(field)) {
    return { label: field, value: `${product.name}${product.sku ? ` / ${product.sku}` : ''}` };
  }
  if (/^(?:Document control|दस्तावेज़ नियंत्रण)$/i.test(field)) {
    return { label: /^Document control$/i.test(field) ? 'Pattern details' : 'पैटर्न का विवरण', value };
  }
  return { label: field, value };
}

function patternControlText(text: string, product: PatternProduct): string | null {
  const field = text.match(/^((?:Pattern ID|Prepared by|पैटर्न ID|तैयार किया)(?:\s*\/[^:：]+)?)\s*[:：]\s*(.*)$/i);
  if (!field) return text;
  const entry = patternControlEntry(field[1]!, field[2]!, product);
  return entry ? `${entry.label}: ${entry.value}` : null;
}

function patternText(element: Element): string {
  function read(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof Element)) return '';
    if (node.tagName === 'BR') return '\n';
    const text = [...node.childNodes].map(read).join('');
    return /^(P|DIV|LI|H[1-6])$/.test(node.tagName) ? `\n${text}\n` : text;
  }
  return read(element).replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n+/g, '\n').trim();
}

export function patternBlocks(html: string, product?: PatternProduct, language: PatternLanguage = 'en'): Block[] {
  const root = new DOMParser().parseFromString(html, 'text/html').body;
  const blocks: Block[] = [];
  function visit(element: Element) {
    if (element.tagName === 'TABLE') {
      if (element.querySelector('img,table')) throw new Error('Move nested tables or images out of table cells before preparing the pattern.');
      const rows = [...element.querySelectorAll('tr')].map(row => [...row.querySelectorAll<HTMLTableCellElement>('th,td')].map(cell => {
        if (cell.rowSpan !== 1) throw new Error('Unmerge vertically merged table cells before preparing the pattern. Horizontal merged headings are supported.');
        return { text: patternText(cell), columnSpan: cell.colSpan };
      })).flatMap(row => {
        if (product && row.length === 2 && row.every(cell => cell.columnSpan === 1)) {
          const entry = patternControlEntry(row[0]!.text, row[1]!.text, product);
          if (!entry) return [];
          row[0]!.text = entry.label;
          row[1]!.text = entry.value;
        }
        return [row];
      });
      const columns = rows[0]?.reduce((total, cell) => total + cell.columnSpan, 0);
      if (rows.some(row => !row.length || row.reduce((total, cell) => total + cell.columnSpan, 0) !== columns)) {
        throw new Error('Use table rows with the same total number of columns in the pattern.');
      }
      if (rows.length) blocks.push({ kind: 'table', rows });
    } else if (['P', 'H1', 'H2', 'H3', 'H4', 'LI'].includes(element.tagName)) {
      const importedText = patternText(element);
      const text = importedText && product ? patternControlText(importedText, product) : importedText;
      if (text && !(product && generatedPatternText(text))) {
        blocks.push({ kind: /^H/.test(element.tagName) ? 'heading' : 'text', text });
      }
      for (const image of element.querySelectorAll('img')) visit(image);
    } else if (element.tagName === 'IMG') {
      const data = element.getAttribute('src') ?? '';
      if (!/^data:image\/(?:png|jpeg|gif|webp);base64,/.test(data)) throw new Error('Only embedded pattern images are supported.');
      blocks.push({ kind: 'image', data });
    } else {
      for (const child of element.children) visit(child);
    }
  }
  for (const element of root.children) visit(element);
  const formatted: Block[] = [];
  let abbreviationSection = false;
  let abbreviationTable: Extract<Block, { kind: 'table' }> | undefined;
  let constructionSection = false;
  let constructionTable: Extract<Block, { kind: 'table' }> | undefined;
  for (const block of blocks) {
    if (block.kind === 'heading') {
      abbreviationSection = /abbreviations|संक्षिप्त|संक्षेप/i.test(block.text);
      constructionSection = /reference.*construction|संदर्भ.*(?:बनावट|रचना)/i.test(block.text);
    }
    if (constructionSection && block.kind === 'text') {
      if (!constructionTable) {
        constructionTable = { kind: 'table', rows: [[{ text: patternLabels[language].construction, columnSpan: 1 }]] };
        formatted.push(constructionTable);
      }
      constructionTable.rows.push([{ text: block.text, columnSpan: 1 }]);
      continue;
    }
    constructionTable = undefined;
    if (!abbreviationSection || block.kind !== 'text') {
      abbreviationTable = undefined;
      formatted.push(block);
      continue;
    }
    const lines = block.text.replace(/^(US terms:)\s*/i, '$1\n').split(/\n|;\s*(?=[^;=\n]+?=)/);
    for (const line of lines.filter(line => line.trim())) {
      const definition = line.match(/^([^=]+?)\s*=\s*(.+)$/);
      if (!definition) {
        abbreviationTable = undefined;
        formatted.push({ kind: 'text', text: line.trim() });
        continue;
      }
      if (!abbreviationTable) {
        abbreviationTable = { kind: 'table', rows: [[
          { text: patternLabels[language].abbreviation, columnSpan: 1 },
          { text: patternLabels[language].meaning, columnSpan: 1 },
        ]] };
        formatted.push(abbreviationTable);
      }
      abbreviationTable.rows.push([
        { text: definition[1]!.trim(), columnSpan: 1 },
        { text: definition[2]!.trim().replace(/;$/, ''), columnSpan: 1 },
      ]);
    }
  }
  return formatted;
}

const unfilledPatternField = /^(?:enter\b|add\b|confirm\b|choose\b|specify\b|paste\b|insert\b|fill(?:ed)?\b|assigned\b|your\b|write\b|describe\b|define\b|state\b|continue as needed\b|version\b|date\b|beginner\b|dimensions\b|allowed variation\b|fibre\b|brand\b|grams\b|size\b|hook\b|yarn\b|gauge\b|match approved\b|even tension\b|applicable checks\b|reviewer\b|reference the\b|record questions\b|quantity\b|stitches\s*\/|part\s+[A-Z]\s*\/|check$|R\d+$|आसान|उत्पाद|एडमिन|गिनती|गेज|तिथि|तैयार उत्पाद|धागे का|निर्देश$|नीचे|भागों को|मात्रा|राउंड जोड़ने|संस्करण|समीक्षक|सेमी|स्वीकार्य|स्वीकृत नमूने|हिन्दी में|हुक का)/i;

function completedPdfText(text: string): string {
  const cleaned = text.replace(/\[([^\]\n]+)\]/g, (original: string, field: string) => {
    const stitchNotation = /\b(?:ch|sl\s*st|sc|hdc|dc|tr|inc|dec)\b/i.test(field);
    const roundReference = /^R\d+$/i.test(field.trim()) && original !== text.trim();
    return unfilledPatternField.test(field.trim()) && !stitchNotation && !roundReference ? '' : original;
  });
  if (cleaned === text) return text.replace(/\s*\|\s*Fill in the remaining bracketed fields before sharing\.?$/i, '').trim();
  const result = cleaned.replace(/([/|])(?:\s*[/|])+/g, '$1')
    .replace(/^(?:\s*[/|])+\s*|(?:\s*[/|])+\s*$/g, '').replace(/[ \t]{2,}/g, ' ').trim();
  return /^[^:：]+[:：]\s*$/.test(result) ? '' : result;
}

export function pdfPatternBlocks(blocks: Block[]): Block[] {
  const completed = blocks.flatMap((block): Block[] => {
    if (block.kind === 'image') return [block];
    if (block.kind !== 'table') {
      const text = completedPdfText(block.text);
      return text ? [{ ...block, text }] : [];
    }
    const rows = block.rows.map(row => row.map(cell => ({ ...cell, text: completedPdfText(cell.text) })))
      .filter((row, index) => {
        if (index > 0 && row.length > 1 && row.every(cell => cell.columnSpan === 1)) {
          return row.slice(1).some(cell => cell.text);
        }
        return row.some(cell => cell.text);
      });
    return rows.length && !(rows.length === 1 && block.rows.length > 1) ? [{ kind: 'table', rows }] : [];
  });
  return completed.filter((block, index) => block.kind !== 'heading'
    || (completed[index + 1] && completed[index + 1]!.kind !== 'heading'));
}

export function protectedPdfDefinition(language: PatternLanguage, content: Content[]): TDocumentDefinitions {
  return {
    version: '1.7ext3', ownerPassword: crypto.randomUUID() + crypto.randomUUID(),
    permissions: { printing: 'highResolution', modifying: false, copying: false, annotating: false,
      fillingForms: false, contentAccessibility: false, documentAssembly: false },
    pageSize: 'A4', pageMargins: [40, 35, 40, 80],
    defaultStyle: { font: language === 'hi' ? 'NotoDevanagari' : 'Roboto', fontSize: 10, color: '#5d4037', lineHeight: 1.3 },
    background: (_page, size) => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: size.width, h: size.height, color: '#fffaf0' }] }),
    footer: (page, pages) => ({
      margin: [40, 6, 40, 0], layout: 'noBorders',
      table: { widths: ['*'], heights: [44, 12], body: [
        [{ text: page === pages ? patternLabels[language].copyright : '', fontSize: 7, lineHeight: 1.1 }],
        [{ text: `Luvia Creations | ${page}`, alignment: 'center', fontSize: 8 }],
      ] },
    }),
    content,
  };
}

export async function preparePatternDocuments(product: PatternProduct, language: PatternLanguage,
  input: File | string, onProgress?: (message: string) => void): Promise<PreparedPattern> {
  onProgress?.('Reading pattern instructions…');
  const warnings: string[] = [];
  let blocks: Block[];
  if (typeof input === 'string') {
    if (!input.trim() || input.length > 60000) throw new Error('Enter pattern instructions up to 60,000 characters.');
    blocks = input.split(/\r?\n/).filter(line => line.trim() && !generatedPatternText(line.trim()))
      .flatMap((text): Block[] => {
        const content = patternControlText(text.trim(), product);
        return content ? [{ kind: 'text', text: content }] : [];
      });
  } else {
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ arrayBuffer: await input.arrayBuffer() });
    if (result.messages.some(message => message.type === 'error')) throw new Error('Word conversion reported an error. Check this document before preparing it.');
    warnings.push(...result.messages.map(message => message.message));
    blocks = patternBlocks(result.value, product, language);
    if (!blocks.length) throw new Error('This Word document has no supported pattern content.');
  }
  if (!blocks.length) throw new Error('Add pattern instructions; generated cover fields alone are not pattern content.');
  const pdfBlocks = pdfPatternBlocks(blocks);
  if (!pdfBlocks.some(block => block.kind !== 'heading')) throw new Error('Fill in pattern instructions before preparing the PDF.');
  onProgress?.('Loading document tools, branding, product photo and fonts…');
  const [docx, pdfModule, fonts, logo, photo, hindiResponse] = await Promise.all([
    import('docx'), import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts'),
    imageData('/images/luvia-pattern-logo.jpg'), imageData(getProductImageUrl(product.image, 960)),
    language === 'hi' ? fetch('/fonts/NotoSansDevanagari-Regular.ttf', { signal: AbortSignal.timeout(20000) }) : Promise.resolve(null),
  ]);
  const pdfMake = pdfModule.default;
  pdfMake.addVirtualFileSystem(fonts.default);
  let hindiFont: Uint8Array<ArrayBuffer> | undefined;
  if (hindiResponse) {
    if (!hindiResponse.ok) throw new Error('Unable to load the Hindi font. Retry before sharing.');
    const bytes = new Uint8Array(await hindiResponse.arrayBuffer());
    hindiFont = bytes;
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    pdfMake.addVirtualFileSystem({ 'NotoDevanagari.ttf': btoa(binary) });
    pdfMake.addFonts({ NotoDevanagari: { normal: 'NotoDevanagari.ttf', bold: 'NotoDevanagari.ttf',
      italics: 'NotoDevanagari.ttf', bolditalics: 'NotoDevanagari.ttf' } });
  }
  onProgress?.('Preparing Word and PDF layout…');
  const labels = patternLabels[language];
  const url = `https://luviacreations.com${new URL(toProductUrl(product)).pathname}`;
  const font = language === 'hi' ? 'Noto Sans Devanagari' : 'Calibri';
  const paragraph = (text: string, bold = false, centered = false) => new docx.Paragraph({
    children: text.split('\n').map((line, index) => new docx.TextRun({
      text: line, break: index > 0 ? 1 : 0, bold, font, color: '5D4037',
    })),
    alignment: centered ? docx.AlignmentType.CENTER : docx.AlignmentType.LEFT, spacing: { after: 120 },
  });
  const picture = (image: typeof photo, width: number, centered = true) => new docx.Paragraph({
    alignment: centered ? docx.AlignmentType.CENTER : docx.AlignmentType.LEFT,
    children: [new docx.ImageRun({ type: 'jpg', data: image.bytes,
      transformation: { width, height: width * image.height / image.width } })] });
  const children: (InstanceType<typeof docx.Paragraph> | InstanceType<typeof docx.Table>)[] = [
    paragraph(`${labels.preparedBy}: Luvia Creations`, false, true),
    ...(product.sku ? [paragraph(`SKU: ${product.sku}`)] : []),
    new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [
      new docx.ExternalHyperlink({ link: url, children: [new docx.TextRun({ text: `${labels.link}: ${url}`, style: 'Hyperlink', font })] }),
    ] }), picture(photo, Math.min(280, 220 * photo.width / photo.height)), paragraph(labels.terms),
  ];
  const pdfContent: Content[] = [
    { columns: [
      { image: logo.data, width: 70 },
      { width: '*', stack: [
        { text: product.name, bold: true, fontSize: 21, alignment: 'center', margin: [0, 8, 0, 0] },
        { text: labels.title, alignment: 'center', margin: [0, 6, 0, 0] },
      ] },
      { width: 70, text: '' },
    ], margin: [0, 0, 0, 16] },
    { text: `${labels.preparedBy}: Luvia Creations`, alignment: 'center', fontSize: 9, margin: [0, 0, 0, 5] },
    ...(product.sku ? [{ text: `SKU: ${product.sku}`, fontSize: 9, margin: [0, 0, 0, 5] } satisfies Content] : []),
    { text: `${labels.link}: ${url}`, link: url, alignment: 'center', margin: [0, 0, 0, 12] },
    { image: photo.data, fit: [250, 190], alignment: 'center', margin: [0, 0, 0, 14] },
    { text: labels.terms, margin: [0, 0, 0, 12] },
  ];
  for (const block of blocks) {
    if (block.kind === 'table') {
      children.push(new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE },
        rows: block.rows.map((row, index) => new docx.TableRow({ children: row.map(({ text, columnSpan }) => new docx.TableCell({
          columnSpan,
          shading: { fill: index === 0 ? 'F6C453' : 'FFFAF0' }, children: [paragraph(text, index === 0)],
        })) })) }));
    } else if (block.kind === 'image') {
      const image = await imageData(block.data);
      children.push(picture(image, Math.min(400, 300 * image.width / image.height)));
    } else {
      children.push(paragraph(block.text, block.kind === 'heading'));
    }
  }
  children.push(paragraph(labels.copyright));
  for (const block of pdfBlocks) {
    if (block.kind === 'table') {
      const columns = block.rows[0]!.reduce((total, cell) => total + cell.columnSpan, 0);
      const instructionTable = columns === 3 && block.rows[0]!.length === 3
        && /^(?:Instructions|निर्देश)(?:\s|\/|$)/i.test(block.rows[0]![1]!.text);
      const abbreviationTable = columns === 2 && block.rows[0]![0]!.text === labels.abbreviation;
      pdfContent.push({ table: { headerRows: 1,
        widths: instructionTable ? ['18%', '64%', '18%']
          : abbreviationTable ? ['28%', '72%'] : Array.from({ length: columns }, () => '*'),
        body: block.rows.map((row, index) => row.flatMap(({ text, columnSpan }) => [
          { text, colSpan: columnSpan, fillColor: index === 0 ? '#f6c453' : '#fffaf0' },
          ...Array.from({ length: columnSpan - 1 }, () => ({})),
        ])) },
        margin: [0, 6, 0, 10] });
    } else if (block.kind === 'image') {
      const image = await imageData(block.data);
      pdfContent.push({ image: image.data, fit: [400, 300], alignment: 'center', margin: [0, 6, 0, 10] });
    } else {
      pdfContent.push({ text: block.text, bold: block.kind === 'heading', fontSize: block.kind === 'heading' ? 13 : 10,
        ...(block.kind === 'heading' && /reference.*construction|संदर्भ.*(?:बनावट|रचना)/i.test(block.text)
          ? { pageBreak: 'before' as const } : {}),
        margin: [0, 5, 0, 5] });
    }
  }
  const word = new docx.Document({ creator: 'Luvia Creations', title: product.name,
    fonts: hindiFont ? [{ name: font, data: Buffer.from(hindiFont) }] : [],
    styles: { default: { document: { run: { font, size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 1800, header: 360, bottom: 800, left: 800, right: 800 } } },
      headers: { default: new docx.Header({ children: [
        new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE },
          borders: Object.fromEntries(['top', 'bottom', 'left', 'right', 'insideHorizontal', 'insideVertical']
            .map(side => [side, { style: docx.BorderStyle.NONE }])),
          rows: [new docx.TableRow({ children: [
            new docx.TableCell({ width: { size: 15, type: docx.WidthType.PERCENTAGE },
              children: [picture(logo, 70, false)], verticalAlign: docx.VerticalAlign.CENTER }),
            new docx.TableCell({ width: { size: 70, type: docx.WidthType.PERCENTAGE },
              children: [paragraph(product.name, true, true), paragraph(labels.title, false, true)],
              verticalAlign: docx.VerticalAlign.CENTER }),
            new docx.TableCell({ width: { size: 15, type: docx.WidthType.PERCENTAGE }, children: [paragraph('')] }),
          ] })] }),
      ] }) },
      children }] });
  const [wordBlob, pdfBlob] = await Promise.all([
    docx.Packer.toBlob(word).then(blob => { onProgress?.('Word master ready; finishing protected PDF…'); return blob; }),
    pdfMake.createPdf(protectedPdfDefinition(language, pdfContent)).getBlob()
      .then(blob => { onProgress?.('Protected PDF ready; finishing Word master…'); return blob; }),
  ]);
  const base = `${toShareFileName(product.name).slice(0, 80)}-pattern-${language}`;
  if (wordBlob.size > 2 * 1024 * 1024 || pdfBlob.size > 2 * 1024 * 1024) throw new Error('Prepared documents exceed 2 MB. Reduce embedded images or pattern size.');
  return { word: new File([wordBlob], `${base}.docx`, { type: wordBlob.type }),
    pdf: new File([pdfBlob], `${base}.pdf`, { type: 'application/pdf' }), warnings };
}
