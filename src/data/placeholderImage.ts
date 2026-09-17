/**
 * Generates a lightweight placeholder image (SVG data URI) so the catalogue
 * looks good out of the box without needing real product photos yet.
 * Replace `image` in `src/data/products.ts` with real photo paths/URLs
 * (e.g. `/images/beanie.jpg` in the `public/images` folder) when ready.
 */
export function placeholderImage(label: string, bg: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <rect width="100%" height="100%" fill="${bg}" />
      <text x="50%" y="50%" font-family="Segoe UI, sans-serif" font-size="28"
        fill="#3f2f2a" text-anchor="middle" dominant-baseline="middle">${label}</text>
    </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
