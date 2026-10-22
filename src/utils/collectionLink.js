/** @param {string} category */
export const collectionPath = (category) => {
  const slug = category.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return `/collections/${encodeURIComponent(slug || 'collection')}/`;
};

/** @param {string} pathname @param {string} title @param {string} origin */
export const collectionBreadcrumbList = (pathname, title, origin) => ({
  '@type': 'BreadcrumbList',
  itemListElement: [
    { name: 'Home', item: `${origin}/` },
    ...(pathname !== '/collections/' ? [{ name: 'Collections', item: `${origin}/collections/` }] : []),
    { name: title, item: `${origin}${pathname}` },
  ].map((item, index) => ({ '@type': 'ListItem', position: index + 1, ...item })),
});
