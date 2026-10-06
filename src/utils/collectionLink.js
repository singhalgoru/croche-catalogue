/** @param {string} category */
export const collectionPath = (category) => {
  const slug = category.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return `/collections/${encodeURIComponent(slug || 'collection')}/`;
};
