import { describe, expect, it } from 'vitest';
import { suggestVariantColor } from './variantColor';

describe('suggestVariantColor', () => {
  it('matches common colour names without regard to case', () => {
    expect(suggestVariantColor('Red')).toBe('#b91c1c');
    expect(suggestVariantColor('LAVENDER')).toBe('#a78bfa');
  });

  it('uses the first recognised colour in a compound variant name', () => {
    expect(suggestVariantColor('Ivory & Maroon')).toBe('#f5f1e8');
  });

  it('does not replace the colour for an unrecognised variant name', () => {
    expect(suggestVariantColor('Festive edition')).toBeNull();
  });
});
