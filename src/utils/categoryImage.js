export const getCategoryImage = (products, settings) =>
  settings?.coverImage || [...products].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .find(product => product.image)?.image || '';

export const getCategoryHotspots = (products, settings) => !settings?.coverImage ? [] :
  (settings.imageHotspots ?? []).flatMap(spot => {
    const product = products.find(item => item.id === spot.productId);
    return product && Number.isFinite(spot.x) && Number.isFinite(spot.y)
      && spot.x >= 0 && spot.x <= 100 && spot.y >= 0 && spot.y <= 100 ? [{ ...spot, product }] : [];
  });

export const getHotspotGlowOverlay = (width, height, hotspots) => {
  const radius = Math.max(5, Math.min(width, height) * 0.012);
  const padding = Math.ceil(radius * 3);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width + padding * 2}" height="${height + padding * 2}">
    ${hotspots.map(spot => {
      const x = padding + spot.x / 100 * width;
      const y = padding + spot.y / 100 * height;
      return `<circle cx="${x}" cy="${y}" r="${radius * 3}" fill="#edc357" fill-opacity=".18"/>
        <circle cx="${x}" cy="${y}" r="${radius * 2}" fill="#edc357" fill-opacity=".35"/>
        <circle cx="${x}" cy="${y}" r="${radius}" fill="#edc357" stroke="white" stroke-width="2"/>`;
    }).join('')}</svg>`;
  return { width: width + padding * 2, height: height + padding * 2, padding, svg };
};
