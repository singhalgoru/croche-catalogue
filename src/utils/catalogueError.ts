export const CATALOGUE_CONNECTION_MESSAGE = 'Check your internet connection to continue browsing.';

export function getCatalogueErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message
    : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
      ? error.message : '';
  const networkFailure = /(?:failed to fetch|fetch failed|networkerror when attempting to fetch resource|network request failed|load failed|err_internet_disconnected|err_network_changed|err_connection_reset|err_connection_refused|err_name_not_resolved)/i.test(message);
  if (!navigator.onLine || networkFailure) return CATALOGUE_CONNECTION_MESSAGE;
  return message || 'Unable to load catalogue products.';
}
