/** @param {{ id: string, display_name: string }} entry */
export const testimonialSlug = (entry) => {
  const name = entry.display_name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  const id = entry.id.replace(/[^0-9a-f]/gi, '').slice(0, 8).toLowerCase();
  return id ? `${name || 'story'}-${id}` : name || 'story';
};

/** @param {{ id: string, display_name: string }} entry */
export const testimonialPath = (entry) => `/customer-love/${encodeURIComponent(testimonialSlug(entry))}/`;

/** @param {string} pathname */
export const readTestimonialSlug = (pathname) => {
  const match = /^\/customer-love\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
};

/**
 * Exact slug first; otherwise the stable id suffix, so a renamed customer keeps working links.
 * @template {{ id: string, display_name: string }} T
 * @param {T[]} entries @param {string} slug
 * @returns {T | undefined}
 */
export const findTestimonialBySlug = (entries, slug) => {
  const exact = entries.find(entry => testimonialSlug(entry) === slug);
  if (exact) return exact;
  const suffix = /-([0-9a-f]{8})$/.exec(slug)?.[1];
  const matches = suffix ? entries.filter(entry => testimonialSlug(entry).endsWith(`-${suffix}`)) : [];
  return matches.length === 1 ? matches[0] : undefined;
};
