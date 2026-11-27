import { expect, it } from 'vitest';
import { instagramCaptionSummary } from './instagramContent.js';

it('removes emoji and hashtags and truncates long captions at a word boundary', () => {
  expect(instagramCaptionSummary('🧶 Handmade crochet bunny with pink overalls #crochet', 25))
    .toBe('Handmade crochet bunny…');
  expect(instagramCaptionSummary('✨ Handmade bunny #crochet')).toBe('Handmade bunny');
});
