import { expect, it } from 'vitest';
import { countOverviewWords, limitCategoryOverview } from './categoryOverview.js';
it.each([0, 99, 100, 150, 151, 300])('caps an overview containing %s words at 150', count => {
  const text = Array(count).fill('crochet').join(' \n ');
  expect(countOverviewWords(text)).toBe(count);
  expect(countOverviewWords(limitCategoryOverview(text))).toBe(Math.min(count, 150));
});
