import { afterEach, expect, it, vi } from 'vitest';
import { addRecentSearch, readRecentSearches, writeRecentSearches } from './recentSearches';

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

it('normalises whitespace, deduplicates case-insensitively and keeps the latest eight terms', () => {
  expect(addRecentSearch(['Bunny', 'gajra'], '  bunny   white ')).toEqual(['bunny white', 'Bunny', 'gajra']);
  expect(addRecentSearch(['Bunny', 'gajra'], ' BUNNY ')).toEqual(['BUNNY', 'gajra']);
  expect(addRecentSearch(['Bunny'], '   ')).toEqual(['Bunny']);
  const terms = Array.from({ length: 8 }, (_, index) => `term ${index}`);
  expect(addRecentSearch(terms, 'new')).toEqual(['new', ...terms.slice(0, 7)]);
});

it('persists order across reloads and deletes storage when cleared', () => {
  writeRecentSearches(['bunny', 'gajra', 'keychain']);
  expect(readRecentSearches()).toEqual(['bunny', 'gajra', 'keychain']);
  writeRecentSearches([]);
  expect(readRecentSearches()).toEqual([]);
  expect(localStorage.getItem('luvia:recent-searches')).toBeNull();
});

it('reports invalid or unavailable storage instead of accepting invalid history', () => {
  localStorage.setItem('luvia:recent-searches', '{"secret":"invalid"}');
  expect(() => readRecentSearches()).toThrow('Invalid recent search history');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
  expect(() => writeRecentSearches(['bunny'])).toThrow('Storage blocked');
});
