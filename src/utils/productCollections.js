export const productCollections = [
  { path: '/bestsellers/', title: 'Bestsellers', description: 'Popular over the last 90 days', empty: 'No bestsellers are available right now.' },
  { path: '/featured/', title: 'Featured products', description: 'Handpicked handmade favourites from Luvia Creations', empty: 'No featured products are available right now.' },
];

const isPurchasable = product => product.variants.some(variant => variant.inStock && variant.availableQuantity > 0);

export const getBestsellerProducts = (products, ids) => [...new Set(ids)].slice(0, 6).flatMap(id => {
  const product = products.find(candidate => candidate.id === id);
  return product && isPurchasable(product) ? [product] : [];
});

export const getFeaturedProducts = products => products.filter(product => product.featured && isPurchasable(product))
  .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id));

export const getLatestProduct = (products, now = Date.now()) => products
  .filter(product => {
    const time = Date.parse(product.publishedAt);
    const variant = product.variants.find(item => item.inStock && item.availableQuantity > 0);
    return Number.isFinite(time) && time <= now && isPurchasable(product)
      && Boolean(variant?.image || product.image);
  })
  .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id))[0];
