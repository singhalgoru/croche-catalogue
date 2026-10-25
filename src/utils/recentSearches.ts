const STORAGE_KEY = 'luvia:recent-searches';
const MAX_RECENT_SEARCHES = 8;

export function readRecentSearches(): string[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every((value): value is string => typeof value === 'string')) {
    throw new Error('Invalid recent search history.');
  }
  return parsed.slice().reverse().reduce<string[]>((terms, term) => addRecentSearch(terms, term), []);
}

export function addRecentSearch(terms: string[], query: string): string[] {
  const term = query.trim().replace(/\s+/g, ' ');
  if (!term) return terms;
  return [term, ...terms.filter(value => value.toLowerCase() !== term.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
}

export function writeRecentSearches(terms: string[]): void {
  if (terms.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(terms));
  else localStorage.removeItem(STORAGE_KEY);
}
