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
    { select, published: 'eq.true', order: 'created_at.asc' },
    'uploaded products',
  );
  window.categoriesPrefetch = fetchRows(
    'categories',
    { select: 'name,sort_order', order: 'sort_order.asc,name.asc' },
    'categories',
  );
}
