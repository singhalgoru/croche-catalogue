import { expect, it } from 'vitest';
import { findTestimonialBySlug, readTestimonialSlug, testimonialPath, testimonialSlug } from './testimonialLink';

const story = { id: 'cdcad751-a1e6-42a9-b1be-9e6651289385', display_name: 'Shalini, Meerut' };

it('builds readable, stable story URLs', () => {
  expect(testimonialSlug(story)).toBe('shalini-meerut-cdcad751');
  expect(testimonialPath(story)).toBe('/customer-love/shalini-meerut-cdcad751/');
  expect(testimonialSlug({ ...story, display_name: '❤️' })).toBe('story-cdcad751');
  expect(testimonialSlug({ ...story, display_name: 'Ána <b>' })).toBe('ana-b-cdcad751');
});

it('reads story paths and resolves renamed stories by id suffix', () => {
  expect(readTestimonialSlug('/customer-love/shalini-meerut-cdcad751/')).toBe('shalini-meerut-cdcad751');
  expect(readTestimonialSlug('/customer-love/')).toBeNull();
  expect(readTestimonialSlug('/customer-love/a/b/')).toBeNull();
  expect(findTestimonialBySlug([story], 'shalini-meerut-cdcad751')).toBe(story);
  expect(findTestimonialBySlug([story], 'old-name-cdcad751')).toBe(story);
  expect(findTestimonialBySlug([story], 'unknown-00000000')).toBeUndefined();
});
