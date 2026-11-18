import { expect, it } from 'vitest';
import { patternBlocks, patternLabels, protectedPdfDefinition } from './patternDocuments';

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
