import { afterEach, expect, it, vi } from 'vitest';
import { CATALOGUE_CONNECTION_MESSAGE, getCatalogueErrorMessage } from './catalogueError';

afterEach(() => vi.restoreAllMocks());

it.each([
  new TypeError('Failed to fetch'),
  new Error('Unable to load catalogue: TypeError: Failed to fetch'),
  { message: 'NetworkError when attempting to fetch resource.' },
  new TypeError('Load failed'),
])('recognizes browser network failures', error => {
  expect(getCatalogueErrorMessage(error)).toBe(CATALOGUE_CONNECTION_MESSAGE);
});

it('recognizes an offline browser without replacing online server errors', () => {
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  expect(getCatalogueErrorMessage(new Error('Request failed'))).toBe(CATALOGUE_CONNECTION_MESSAGE);
  online.mockReturnValue(true);
  expect(getCatalogueErrorMessage(new Error('Permission denied'))).toBe('Permission denied');
});
