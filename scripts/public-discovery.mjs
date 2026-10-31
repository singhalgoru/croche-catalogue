export const publicContentPages = pages => [...pages]
  .filter(([, html]) => !/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*\bnoindex\b/i.test(html));

const plainText = text => text.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
})[entity]);

export const discoveryPageLinks = pages => publicContentPages(pages).map(([pathname, html]) => {
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  if (!title) throw new Error(`Public discovery page is missing a title: ${pathname}`);
  return { pathname, title: plainText(title.replace(/\s*\| Luvia Creations$/, '')) };
});
