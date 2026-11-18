import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { getProductImageUrl } from '../utils/productImageUrl';
import { toProductUrl } from '../utils/productLink';
import { toShareFileName } from '../utils/shareImage';
import type { Product } from '../types/product';
import { Buffer } from 'buffer';

export type PatternLanguage = 'en' | 'hi';
export type PatternProduct = Pick<Product, 'id' | 'name' | 'image' | 'publicSlug' | 'sku'>;
type Block = { kind: 'text' | 'heading'; text: string }
  | { kind: 'table'; rows: string[][] } | { kind: 'image'; data: string };
export interface PreparedPattern { word: File; pdf: File; warnings: string[] }
export const patternLabels = {
  en: {
    title: 'Artisan working pattern', link: 'Product page', photo: 'Main product photo',
    patternId: 'Pattern ID', preparedBy: 'Prepared by',
    copyright: 'Copyright © Luvia Creations. All rights reserved. Copying, editing, sharing or distributing this document without the prior explicit written consent of Luvia Creations is prohibited, except as permitted by applicable law. Printing for the agreed artisan work is allowed.',
    terms: 'Private working copy. Confirm the sample, quantity, rate, materials and deadline separately before starting production.',
  },
  hi: {
    title: 'कारीगर के लिए क्रोशिया पैटर्न', link: 'उत्पाद का पेज', photo: 'उत्पाद की मुख्य तस्वीर',
    patternId: 'पैटर्न ID', preparedBy: 'तैयार किया',
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

export const productPatternId = (product: Pick<PatternProduct, 'id' | 'name' | 'sku'>): string =>
  `${product.name.trim()}-${product.sku ?? product.id}`;

function patternControlValue(label: string, value: string, product: PatternProduct): string {
  const field = label.trim();
  if (/^(?:Product|उत्पाद)\s*\/\s*SKU$/i.test(field)) {
    return `${product.name}${product.sku ? ` / ${product.sku}` : ''}`;
  }
  const identity = /^(?:Pattern ID|पैटर्न ID)(?:\s*\/.*)?$/i.test(field) ? productPatternId(product)
    : /^(?:Prepared by|तैयार किया)(?:\s*\/.*)?$/i.test(field) ? 'Luvia Creations' : undefined;
  if (identity === undefined) return value;
  const separator = field.includes('/') ? value.indexOf('/') : -1;
  return identity + (separator >= 0 ? ` ${value.slice(separator).trim()}` : '');
}

function patternControlText(text: string, product: PatternProduct): string {
  const field = text.match(/^((?:Pattern ID|Prepared by|पैटर्न ID|तैयार किया)(?:\s*\/[^:：]+)?)\s*[:：]\s*(.*)$/i);
  return field ? `${field[1]}: ${patternControlValue(field[1]!, field[2]!, product)}` : text;
}

export function patternBlocks(html: string, product?: PatternProduct): Block[] {
  const root = new DOMParser().parseFromString(html, 'text/html').body;
  const blocks: Block[] = [];
  function visit(element: Element) {
    if (element.tagName === 'TABLE') {
      if (element.querySelector('img,table')) throw new Error('Move nested tables or images out of table cells before preparing the pattern.');
      const rows = [...element.querySelectorAll('tr')].map(row => [...row.querySelectorAll('th,td')].map(cell => cell.textContent ?? ''));
      if (rows.some(row => row.length !== rows[0]?.length)) throw new Error('Use a regular table without merged cells in the pattern.');
      if (product) for (const row of rows) {
        if (row.length === 2) row[1] = patternControlValue(row[0]!, row[1]!, product);
      }
      if (rows.length) blocks.push({ kind: 'table', rows });
    } else if (['P', 'H1', 'H2', 'H3', 'H4', 'LI'].includes(element.tagName)) {
      let text = element.textContent?.trim();
      if (text && product) text = patternControlText(text, product);
      if (text) blocks.push({ kind: /^H/.test(element.tagName) ? 'heading' : 'text', text });
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
  return blocks;
}

export function protectedPdfDefinition(language: PatternLanguage, content: Content[]): TDocumentDefinitions {
  return {
    version: '1.7ext3', ownerPassword: crypto.randomUUID() + crypto.randomUUID(),
    permissions: { printing: 'highResolution', modifying: false, copying: false, annotating: false,
      fillingForms: false, contentAccessibility: false, documentAssembly: false },
    pageSize: 'A4', pageMargins: [40, 35, 40, 40],
    defaultStyle: { font: language === 'hi' ? 'NotoDevanagari' : 'Roboto', fontSize: 10, color: '#5d4037', lineHeight: 1.3 },
    background: (_page, size) => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: size.width, h: size.height, color: '#fffaf0' }] }),
    footer: page => ({ text: `Luvia Creations | ${page}`, alignment: 'center', fontSize: 8, margin: [0, 12, 0, 0] }),
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
    blocks = input.split(/\r?\n/).filter(line => line.trim())
      .map(text => ({ kind: 'text', text: patternControlText(text.trim(), product) }));
  } else {
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ arrayBuffer: await input.arrayBuffer() });
    if (result.messages.some(message => message.type === 'error')) throw new Error('Word conversion reported an error. Check this document before preparing it.');
    warnings.push(...result.messages.map(message => message.message));
    blocks = patternBlocks(result.value, product);
    if (!blocks.length) throw new Error('This Word document has no supported pattern content.');
  }
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
  const patternId = productPatternId(product);
  const url = `https://luviacreations.com${new URL(toProductUrl(product)).pathname}`;
  const font = language === 'hi' ? 'Noto Sans Devanagari' : 'Calibri';
  const paragraph = (text: string, bold = false, centered = false) => new docx.Paragraph({
    children: [new docx.TextRun({ text, bold, font, color: '5D4037' })],
    alignment: centered ? docx.AlignmentType.CENTER : docx.AlignmentType.LEFT, spacing: { after: 120 },
  });
  const picture = (image: typeof photo, width: number) => new docx.Paragraph({ alignment: docx.AlignmentType.CENTER,
    children: [new docx.ImageRun({ type: 'jpg', data: image.bytes,
      transformation: { width, height: width * image.height / image.width } })] });
  const children: (InstanceType<typeof docx.Paragraph> | InstanceType<typeof docx.Table>)[] = [
    paragraph(labels.copyright, true), paragraph(product.name, true, true), paragraph(labels.title, false, true),
    paragraph(`${labels.patternId}: ${patternId}`), paragraph(`${labels.preparedBy}: Luvia Creations`),
    ...(product.sku ? [paragraph(`SKU: ${product.sku}`)] : []),
    new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [
      new docx.ExternalHyperlink({ link: url, children: [new docx.TextRun({ text: `${labels.link}: ${url}`, style: 'Hyperlink', font })] }),
    ] }), picture(photo, Math.min(280, 220 * photo.width / photo.height)), paragraph(labels.terms),
  ];
  const pdfContent: Content[] = [
    { image: logo.data, width: 70, alignment: 'center', margin: [0, 0, 0, 12] },
    { text: labels.copyright, bold: true, fontSize: 9, margin: [0, 0, 0, 14] },
    { text: product.name, bold: true, fontSize: 21, alignment: 'center' },
    { text: labels.title, alignment: 'center', margin: [0, 8, 0, 8] },
    { text: `${labels.patternId}: ${patternId}`, fontSize: 9, margin: [0, 0, 0, 5] },
    { text: `${labels.preparedBy}: Luvia Creations`, fontSize: 9, margin: [0, 0, 0, 5] },
    ...(product.sku ? [{ text: `SKU: ${product.sku}`, fontSize: 9, margin: [0, 0, 0, 5] } satisfies Content] : []),
    { text: `${labels.link}: ${url}`, link: url, alignment: 'center', margin: [0, 0, 0, 12] },
    { image: photo.data, fit: [250, 190], alignment: 'center', margin: [0, 0, 0, 14] },
    { text: labels.terms, margin: [0, 0, 0, 12] },
  ];
  for (const block of blocks) {
    if (block.kind === 'table') {
      children.push(new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE },
        rows: block.rows.map((row, index) => new docx.TableRow({ children: row.map(text => new docx.TableCell({
          shading: { fill: index === 0 ? 'F6C453' : 'FFFAF0' }, children: [paragraph(text, index === 0)],
        })) })) }));
      pdfContent.push({ table: { headerRows: 1, widths: block.rows[0]!.map(() => '*'),
        body: block.rows.map((row, index) => row.map(text => ({ text, fillColor: index === 0 ? '#f6c453' : '#fffaf0' }))) },
        margin: [0, 6, 0, 10] });
    } else if (block.kind === 'image') {
      const image = await imageData(block.data);
      children.push(picture(image, Math.min(400, 300 * image.width / image.height)));
      pdfContent.push({ image: image.data, fit: [400, 300], alignment: 'center', margin: [0, 6, 0, 10] });
    } else {
      children.push(paragraph(block.text, block.kind === 'heading'));
      pdfContent.push({ text: block.text, bold: block.kind === 'heading', fontSize: block.kind === 'heading' ? 13 : 10,
        margin: [0, 5, 0, 5] });
    }
  }
  const word = new docx.Document({ creator: 'Luvia Creations', title: product.name,
    fonts: hindiFont ? [{ name: font, data: Buffer.from(hindiFont) }] : [],
    styles: { default: { document: { run: { font, size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 1500, bottom: 800, left: 800, right: 800 } } },
      headers: { default: new docx.Header({ children: [picture(logo, 70), paragraph('LUVIA CREATIONS | MADE WITH LOVE', false, true)] }) },
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
