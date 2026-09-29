import type { CatalogueFilter } from '../types/product';

/**
 * Tapping the active category again clears the filter. "All" is already the
 * cleared state, so tapping it is a no-op rather than a toggle.
 */
export const resolveCategorySelection = (
  selected: CatalogueFilter,
  active: CatalogueFilter,
): CatalogueFilter => (selected !== 'All' && selected === active ? 'All' : selected);

/**
 * Moves the active filter to the front so shoppers can see at a glance that
 * the catalogue is filtered, even when that chip was scrolled out of view.
 * Everything else keeps its original order, so clearing the filter puts the
 * chip straight back where it was.
 */
export const orderCategoryOptions = (
  options: CatalogueFilter[],
  active: CatalogueFilter,
): CatalogueFilter[] =>
  active === 'All' || !options.includes(active)
    ? options
    : [active, ...options.filter((option) => option !== active)];
