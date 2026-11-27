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
  if (`${name}${compactSuffix}`.length <= MAX_TITLE_LENGTH) return `${name}${compactSuffix}`;
  const nameLength = MAX_TITLE_LENGTH - compactSuffix.length - 1;
  const prefix = name.slice(0, nameLength + 1);
  const boundary = prefix.lastIndexOf(' ');
  return `${(boundary > 0 ? prefix.slice(0, boundary) : name.slice(0, nameLength)).trimEnd()}…${compactSuffix}`;
};
