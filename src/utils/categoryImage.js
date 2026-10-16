export const getCategoryImage = (products, settings) =>
  settings?.coverImage || [...products].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .find(product => product.image)?.image || '';

export const getCategoryHotspots = (products, settings) => !settings?.coverImage ? [] :
  (settings.imageHotspots ?? []).flatMap(spot => {
    const product = products.find(item => item.id === spot.productId);
    return product && Number.isFinite(spot.x) && Number.isFinite(spot.y)
      && spot.x >= 0 && spot.x <= 100 && spot.y >= 0 && spot.y <= 100 ? [{ ...spot, product }] : [];
  });
