import { describe, expect, it } from 'vitest';
import { orderCategoryOptions, resolveCategorySelection } from './categorySelection';

const OPTIONS = ['All', 'New', 'Festive Decor', 'Anklets', 'Brooches', 'Toys'];

describe('orderCategoryOptions', () => {
  it('keeps the original order when nothing is filtered', () => {
    expect(orderCategoryOptions(OPTIONS, 'All')).toEqual(OPTIONS);
  });

  it('moves the selected category to the front and keeps the rest in order', () => {
    expect(orderCategoryOptions(OPTIONS, 'Brooches')).toEqual([
      'Brooches', 'All', 'New', 'Festive Decor', 'Anklets', 'Toys',
    ]);
  });

  it('moves the New filter to the front too', () => {
    expect(orderCategoryOptions(OPTIONS, 'New')[0]).toBe('New');
  });

  it('does not reorder the source list, so clearing restores the original order', () => {
    const source = [...OPTIONS];
    orderCategoryOptions(source, 'Toys');
    expect(source).toEqual(OPTIONS);
    expect(orderCategoryOptions(source, 'All')).toEqual(OPTIONS);
  });

  it('ignores an active filter that is not in the list', () => {
    expect(orderCategoryOptions(OPTIONS, 'Missing')).toEqual(OPTIONS);
  });
});

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
