import { describe, expect, it } from 'vitest';
import { resolveCategorySelection } from './categorySelection';

describe('resolveCategorySelection', () => {
  it('clears the filter when the active category is tapped again', () => {
    expect(resolveCategorySelection('Anklets', 'Anklets')).toBe('All');
  });

  it('switches to the tapped category when a different one is active', () => {
    expect(resolveCategorySelection('Anklets', 'Brooches')).toBe('Anklets');
  });

  it('selects a category when nothing is filtered yet', () => {
    expect(resolveCategorySelection('Anklets', 'All')).toBe('Anklets');
  });

  it('stays on All when All is tapped again, since it is already cleared', () => {
    expect(resolveCategorySelection('All', 'All')).toBe('All');
  });

  it('clears the New filter when it is tapped again', () => {
    expect(resolveCategorySelection('New', 'New')).toBe('All');
  });
});
