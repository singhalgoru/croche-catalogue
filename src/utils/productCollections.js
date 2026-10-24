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
