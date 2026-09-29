// Catalogue ordering lives here so the app query and the prefetch in
// public/catalogue-prefetch.js cannot drift apart.

export const CATALOGUE_ORDER_COLUMN = 'sort_order';
export const CATALOGUE_TIEBREAK_COLUMN = 'created_at';

// PostgREST order string used by public/catalogue-prefetch.js.
export const CATALOGUE_ORDER_QUERY = 'sort_order.asc,created_at.desc';

// Newly published products go to the front of the catalogue. The admin can
// still drag items into any order, which renormalises every sort_order to
// 0..n-1, so taking one below the current minimum keeps working afterwards.
export const getNewProductSortOrder = (lowestSortOrder: number | null | undefined) =>
  (lowestSortOrder ?? 0) - 1;
