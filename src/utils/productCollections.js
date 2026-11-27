export const productCollections = [
  { path: '/bestsellers/', title: 'Bestsellers', description: 'Popular over the last 90 days. Explore these handmade favourites, then check the product page for current colours, variants and availability before ordering.', metaDescription: 'Explore popular handmade crochet gifts and accessories from Luvia Creations, ranked over the last 90 days. Check current colours and availability.', empty: 'No bestsellers are available right now.' },
  { path: '/featured/', title: 'Featured products', description: 'Handpicked handmade favourites from Luvia Creations. Explore the selected pieces and open each product for photos, available options and ordering details.', metaDescription: 'Discover featured handmade crochet gifts, accessories, toys and decor from Luvia Creations. Explore product details and current availability.', empty: 'No featured products are available right now.' },
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
