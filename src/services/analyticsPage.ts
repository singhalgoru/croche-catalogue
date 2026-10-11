export const analyticsPage = (href = window.location.href) => {
  const url = new URL(href);
  const query = new URLSearchParams();
  const checkout = url.searchParams.get('checkout');
  if (checkout && ['cart', 'delivery', 'review', 'confirmation'].includes(checkout)) query.set('checkout', checkout);
  if (url.searchParams.get('account') === 'orders') query.set('account', 'orders');
  const path = `${url.pathname}${query.size ? `?${query}` : ''}`;
  return { page_path: path, page_location: `${url.origin}${path}` };
};

export const hasAnalyticsAuthTokens = () => {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  return ['access_token', 'refresh_token', 'token_hash', 'code'].some(key => url.searchParams.has(key) || hash.has(key));
};
