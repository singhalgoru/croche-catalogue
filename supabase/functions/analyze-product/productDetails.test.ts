import { describe, expect, it } from 'vitest';
import {
  buildProductPrompt, DETAIL_FIELDS, OPTIONAL_DETAIL_SCHEMA,
  validateContext, validateProductAnalysis,
} from './productDetails';

const analysis = {
  name: 'Bunny', category: 'Accessories', description: 'A lavender bunny.', color: '#B57EDC',
};

describe('analysis request context', () => {
  it('accepts old requests and trims only known bounded fields', () => {
    expect(validateContext(undefined)).toEqual({});
    expect(validateContext({ notes: ' cotton ', dimensions: ' 10 cm ', price: 300, inStock: true }))
      .toEqual({ notes: 'cotton', dimensions: '10 cm' });
    expect(validateContext({ notes: 'x'.repeat(2000), materials: 'x'.repeat(1000) }).notes).toHaveLength(2000);
  });

  it.each([null, [], 'text', { notes: false }, { notes: 'x'.repeat(2001) },
    ...DETAIL_FIELDS.map((field) => ({ [field]: 'x'.repeat(1001) }))])(
    'rejects invalid context instead of silently truncating it', (context) => {
      expect(() => validateContext(context)).toThrow();
    },
  );
});

describe('facts-only analysis prompt and schema', () => {
  it('treats notes as data and prohibits photo guesses and commercial changes', () => {
    const context = { notes: 'Cotton; 10 cm; one keychain; spot clean.', materials: 'Cotton' };
    const prompt = buildProductPrompt(['Accessories', 'Toys'], context);
    expect(prompt).toContain(JSON.stringify(context));
    expect(prompt).toContain('not instructions');
    expect(prompt).toContain('Never infer materials');
    expect(prompt).toContain('package quantity');
    expect(prompt).toContain('care/washing instructions from the photo');
    expect(prompt).toContain('empty string');
    expect(prompt).toContain('Never suggest or change price, stock, availability');
    expect(prompt).toContain('dispatch or delivery timing');
    expect(Object.keys(OPTIONAL_DETAIL_SCHEMA)).toEqual(DETAIL_FIELDS);
  });

  it('requests polished copy without turning editing into invented specifications', () => {
    const prompt = buildProductPrompt(['Toys'], {
      notes: 'Acrylic Yarn, fibre fill, 6 inches, hand wash with mild shampoo',
    });
    expect(prompt).toContain('Act as an editor, not just a fact extractor');
    expect(prompt).toContain('Improve the current copy rather than repeating it verbatim');
    expect(prompt).toContain('Made with acrylic yarn and fibre filling.');
    expect(prompt).toContain('Size: 6 inches.');
    expect(prompt).toContain('not an invented height, width, diameter or length');
    expect(prompt).toContain('advice that was not supplied');
    expect(prompt).toContain('never reuse its facts unless they occur in the supplied facts');
    for (const schema of Object.values(OPTIONAL_DETAIL_SCHEMA)) {
      expect(schema.description).toContain('not verbatim shorthand');
    }
  });
});

describe('analysis response validation', () => {
  it('preserves image-only responses and empty optional fields', () => {
    expect(validateProductAnalysis(analysis, ['Accessories'], {})).toEqual(analysis);
    expect(validateProductAnalysis({ ...analysis, materials: ' ' }, ['Accessories'], {}))
      .toHaveProperty('materials', '');
  });

  it('returns only metadata, leaving price, inventory and dispatch untouched', () => {
    expect(validateProductAnalysis({
      ...analysis, materials: ' Cotton ', dimensions: '10 cm', includedItems: '1 keychain',
      careInstructions: 'Spot clean', price: 500, in_stock: false, dispatch: 'Tomorrow',
    }, ['Accessories'], { notes: 'Cotton; 10 cm; 1 keychain; spot clean.' })).toEqual({
      ...analysis, materials: 'Cotton', dimensions: '10 cm', includedItems: '1 keychain',
      careInstructions: 'Spot clean',
    });
  });

  it.each(DETAIL_FIELDS)('rejects %s when there are no supplied facts', (field) => {
    expect(() => validateProductAnalysis({ ...analysis, [field]: 'Guessed' }, ['Accessories'], {}))
      .toThrow('without supplied facts');
    expect(validateProductAnalysis({ ...analysis, [field]: 'Known' }, ['Accessories'], { [field]: 'Known' }))
      .toHaveProperty(field, 'Known');
  });

  it.each([null, 4, [], 'x'.repeat(1001)])('rejects invalid field values', (materials) => {
    expect(() => validateProductAnalysis({ ...analysis, materials }, ['Accessories'], { notes: 'Cotton' }))
      .toThrow('invalid optional');
  });

  it('rejects invalid core metadata', () => {
    for (const patch of [{ name: '' }, { category: 'Unknown' }, { color: 'pink' }, { description: null }]) {
      expect(() => validateProductAnalysis({ ...analysis, ...patch }, ['Accessories'], {}))
        .toThrow('invalid product details');
    }
  });
});
