export const getCategoryImage = (products, settings) =>
  settings?.coverImage || [...products].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .find(product => product.image)?.image || '';

export const getCategoryHotspots = (products, settings) => !settings?.coverImage ? [] :
  (settings.imageHotspots ?? []).flatMap(spot => {
    const product = products.find(item => item.id === spot.productId);
    return product && Number.isFinite(spot.x) && Number.isFinite(spot.y)
      && spot.x >= 0 && spot.x <= 100 && spot.y >= 0 && spot.y <= 100 ? [{ ...spot, product }] : [];
  });

export const getHotspotRingOverlay = (width, height, hotspots) => {
  const radius = Math.max(4, Math.min(width, height) * 0.006);
  const padding = Math.ceil(radius + 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width + padding * 2}" height="${height + padding * 2}">
    ${hotspots.map(spot => {
      const x = padding + spot.x / 100 * width;
      const y = padding + spot.y / 100 * height;
      return `<circle cx="${x}" cy="${y}" r="${radius + 0.75}" fill="none" stroke="#604239" stroke-opacity=".6" stroke-width=".75"/>
        <circle cx="${x}" cy="${y}" r="${radius}" fill="none" stroke="white" stroke-width="1.5"/>`;
    }).join('')}</svg>`;
  return { width: width + padding * 2, height: height + padding * 2, padding, svg };
};
