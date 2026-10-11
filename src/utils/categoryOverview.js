export const countOverviewWords = text => text.trim().split(/\s+/u).filter(Boolean).length;
export const limitCategoryOverview = text => countOverviewWords(text) <= 90
  ? text.trim()
  : text.trim().split(/\s+/u).slice(0, 90).join(' ');
