import type { CatalogueFilter } from '../types/product';

/**
 * Tapping the active category again clears the filter. "All" is already the
 * cleared state, so tapping it is a no-op rather than a toggle.
 */
export const resolveCategorySelection = (
  selected: CatalogueFilter,
  active: CatalogueFilter,
): CatalogueFilter => (selected !== 'All' && selected === active ? 'All' : selected);
