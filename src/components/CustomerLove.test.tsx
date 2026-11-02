import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CustomerLove, { TestimonialCard } from './CustomerLove';
import { newTestimonial, fetchTestimonials } from '../services/customerLove';
import { testimonialPath } from '../utils/testimonialLink.js';
vi.mock('../services/customerLove', async original => ({ ...await original<object>(), fetchTestimonials: vi.fn() }));
vi.mock('./RotatingCarousel', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const entries = [
  { ...newTestimonial(), display_name: 'Featured customer', quote: 'A wonderful handmade keepsake.', featured: true, product_ids: ['one', 'three'] },
  { ...newTestimonial(), display_name: 'Another customer', quote: 'This is a lovely gift.', featured: false, product_ids: ['two'] },
];
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it('shortens long carousel quotes with ellipses and links to the complete story', () => {
  const quote = 'a'.repeat(239) + '\uD83D\uDC69\u200D\uD83C\uDFA8' + ' ending of the full story';
  const story = { ...entries[0], quote };
  const { rerender } = render(<TestimonialCard entry={story} />);
  expect(screen.getByRole('blockquote').textContent).toContain('a'.repeat(239) + '\uD83D\uDC69\u200D\uD83C\uDFA8...');
  expect(screen.queryByText(/ending of the full story/)).toBeNull();
  expect(screen.getByRole('link', { name: /Read full testimonial/ }).getAttribute('href')).toBe(testimonialPath(story));
  expect(screen.getByRole('link', { name: /Read full testimonial/ }).textContent).toContain('...');
  rerender(<TestimonialCard entry={story} fullQuote />);
  expect(screen.getByRole('blockquote').textContent).toContain(quote);
  expect(screen.queryByRole('link', { name: /Read full testimonial/ })).toBeNull();
  expect(document.getElementById(`testimonial-${story.id}`)).toBeTruthy();
});
it('retains the quote at the 240-character boundary and provides a link for visually clamped text', () => {
  render(<TestimonialCard entry={{ ...entries[0], quote: 'a'.repeat(240) }} />);
  expect(screen.getByRole('blockquote').textContent).toContain('a'.repeat(240));
  expect(screen.getByRole('link', { name: /Read full testimonial/ })).toBeTruthy();
});
it('loads public photos from their R2 URL and hides photos that are not yet in R2', () => {
  const url = 'https://images.luviacreations.com/customer-reviews/story-0123456789abcdef.webp';
  const { rerender } = render(<TestimonialCard entry={{ ...entries[0], has_image: true, image_url: url, image_alt: 'Crochet gift' }} />);
  expect(screen.getByAltText('Crochet gift').getAttribute('src')).toBe(url);
  rerender(<TestimonialCard entry={{ ...entries[0], has_image: true, image_url: null, image_alt: 'Crochet gift' }} />);
  expect(screen.queryByAltText('Crochet gift')).toBeNull();
});
it('blocks right-click save and dragging on customer photos in compact and full cards', () => {
  const url = 'https://images.luviacreations.com/customer-reviews/story-0123456789abcdef.webp';
  const entry = { ...entries[0], has_image: true, image_url: url, image_alt: 'Crochet gift' };
  const { rerender, container } = render(<TestimonialCard entry={entry} />);
  for (const image of container.querySelectorAll('img')) {
    expect(image.getAttribute('draggable')).toBe('false');
    expect(fireEvent.contextMenu(image)).toBe(false);
  }
  rerender(<TestimonialCard entry={entry} fullQuote />);
  expect(screen.getByAltText('Crochet gift').getAttribute('draggable')).toBe('false');
  expect(fireEvent.contextMenu(screen.getByAltText('Crochet gift'))).toBe(false);
});
it('shows featured stories on homepage and every published story on the full page', () => {
  const { rerender } = render(<CustomerLove products={[]} entries={entries} />);
  expect(screen.getByText('Featured customer')).toBeTruthy();
  expect(screen.queryByText('Another customer')).toBeNull();
  rerender(<CustomerLove products={[]} entries={entries} page />);
  expect(screen.getByText('Another customer')).toBeTruthy();
});
it('filters by product and renders literal text without inserting HTML', () => {
  render(<CustomerLove products={[]} productId="two" entries={[...entries,
    { ...entries[1], id: 'extra', quote: '<script>bad()</script>' }]} />);
  expect(screen.queryByText('Featured customer')).toBeNull();
  expect(screen.getByText(/<script>bad/)).toBeTruthy();
  expect(document.querySelector('script')).toBeNull();
});
it('shows a story on every tagged product page, not just the first', () => {
  const { rerender } = render(<CustomerLove products={[]} productId="one" entries={entries} />);
  expect(screen.getByText('Featured customer')).toBeTruthy();
  rerender(<CustomerLove products={[]} productId="three" entries={entries} />);
  expect(screen.getByText('Featured customer')).toBeTruthy();
  expect(screen.queryByText('Another customer')).toBeNull();
});
it('shows load errors and retries rather than pretending there are no testimonials', async () => {
  vi.mocked(fetchTestimonials).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(entries);
  render(<CustomerLove products={[]} />);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Retry customer stories' }));
  expect(await screen.findByText('Featured customer')).toBeTruthy();
});
