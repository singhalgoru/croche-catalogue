const script = document.currentScript;
if (script && window.location.hash !== '#admin') {
  const { supabaseUrl, supabaseKey, select } = script.dataset;
  const fetchRows = (table, query, description) => {
    const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    return fetch(url, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load ${description}: ${response.status} ${response.statusText}`);
      }
      return response.json();
    });
  };
  window.cataloguePrefetch = fetchRows(
    'products',
    { select, published: 'eq.true', order: 'sort_order.asc,created_at.desc' },
    'uploaded products',
  );
  window.categoriesPrefetch = fetchRows(
    'categories',
    { select: 'name,sort_order', order: 'sort_order.asc,name.asc' },
    'categories',
  );
  window.cataloguePrefetch.then(preloadFirstCardImage).catch(() => {});
}

// Starts the first card's photo (the LCP element) while the app bundle is
// still downloading. Must mirror compareCatalogueProducts, the card image
// choice in mapProductRow, and getProductCardSrcSet/sizes in ProductCard.
function preloadFirstCardImage(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const now = Date.now();
  const NEW_PRODUCT_DURATION_MS = 3 * 24 * 60 * 60 * 1000;
  const isNew = (row) => {
    const publishedAt = Date.parse(row.published_at);
    const age = now - publishedAt;
    return Number.isFinite(publishedAt) && age >= 0 && age < NEW_PRODUCT_DURATION_MS;
  };
  const [first] = [...rows].sort(
    (left, right) =>
      Number(Boolean(right.featured)) - Number(Boolean(left.featured)) ||
      Number(isNew(right)) - Number(isNew(left)) ||
      (left.sort_order ?? 0) - (right.sort_order ?? 0),
  );
  const variants = [...(first.product_variants ?? [])].sort(
    (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
  );
  const image = variants.length > 0 ? variants[0].image_url : first.image_url;

  let url;
  try {
    url = new URL(image);
  } catch {
    return;
  }
  const isR2 = url.hostname === 'images.luviacreations.com' || url.hostname.endsWith('.r2.dev');
  if (url.protocol !== 'https:' || !isR2 || !/^\/products\/[^/]+\/[^/]+\.webp$/.test(url.pathname)) {
    return;
  }
  const sized = (width) => image.replace(/\.webp(?=$|[?#])/, `-w${width}.webp`);

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = sized(480);
  link.setAttribute('imagesrcset', `${sized(480)} 480w, ${sized(960)} 960w`);
  link.setAttribute(
    'imagesizes',
    '(max-width: 639px) calc(100vw - 2rem), (max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw',
  );
  link.setAttribute('fetchpriority', 'high');
  document.head.appendChild(link);
}
