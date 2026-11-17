const MAX_TITLE_LENGTH = 60;

export const getBoundedMetaTitle = (title, brand = 'Luvia Creations') => {
  const cleanTitle = title.replace(/\s+/g, ' ').trim();
  const suffix = ` | ${brand}`;
  const fullTitle = `${cleanTitle}${suffix}`;
  if (fullTitle.length <= MAX_TITLE_LENGTH) return fullTitle;

  const titleLength = MAX_TITLE_LENGTH - suffix.length - 1;
  return `${cleanTitle.slice(0, titleLength).trimEnd()}…${suffix}`;
};

export const getProductMetaTitle = (product) => {
  const name = product.name.replace(/\s+/g, ' ').trim();
  const category = product.category.replace(/\s+/g, ' ').trim();
  const title = `${name} | Handmade Crochet ${category}`;
  const fullTitle = `${title} | Luvia`;
  if (fullTitle.length <= MAX_TITLE_LENGTH) return fullTitle;

  const compactSuffix = ' | Crochet | Luvia';
  const nameLength = MAX_TITLE_LENGTH - compactSuffix.length - 1;
  return `${name.slice(0, nameLength).trimEnd()}…${compactSuffix}`;
};
