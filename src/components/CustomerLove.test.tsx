import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CustomerLove, { pickHomeStories, splitDisplayName, TestimonialCard } from './CustomerLove';
import type { Product } from '../types/product';
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
it('lays out the full page as a photo-led hero, a masonry gallery and a share invitation', () => {
  const url = 'https://images.luviacreations.com/customer-reviews/story-0123456789abcdef.webp';
  const gallery = [
    { ...entries[1], display_name: 'Text only, Delhi', sort_order: 0 },
    { ...entries[0], display_name: 'Shalini, Meerut', has_image: true, image_url: url, image_alt: 'Rose gajra worn by customer', sort_order: 1 },
  ];
  const product = { id: 'one', name: 'Rose Gajra' } as Product;
  const { container } = render(<CustomerLove products={[product]} entries={gallery} page />);
  const hero = container.querySelector(`#testimonial-${gallery[1].id}`)!;
  expect(hero.textContent).toContain('Featured story');
  expect(within(hero as HTMLElement).getByAltText('Rose gajra worn by customer').getAttribute('draggable')).toBe('false');
  expect(within(hero as HTMLElement).getByText('Shalini')).toBeTruthy();
  expect(within(hero as HTMLElement).getByText('Meerut').className).toContain('text-cocoa/70');
  expect(within(hero as HTMLElement).getByRole('link', { name: 'Shop Rose Gajra' })).toBeTruthy();
  expect(within(hero as HTMLElement).getByRole('link', { name: 'Read full story from Shalini, Meerut' }).getAttribute('href'))
    .toBe(testimonialPath(gallery[1]));
  const textCard = container.querySelector(`#testimonial-${gallery[0].id}`)!;
  expect(textCard.parentElement?.className).toContain('sm:columns-2');
  expect(textCard.className).toContain('break-inside-avoid');
  expect(textCard.querySelector('blockquote')?.className).toContain('line-clamp-3');
  expect(screen.getByRole('link', { name: 'Share your experience' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
  expect(screen.queryByText(/★/)).toBeNull();
});
it('splits approved display names into name and location labels', () => {
  expect(splitDisplayName('Sangetha , Chennai')).toEqual({ name: 'Sangetha', location: 'Chennai' });
  expect(splitDisplayName('Asha')).toEqual({ name: 'Asha', location: '' });
});
it('shows featured stories on homepage and every published story on the full page', () => {
  const { rerender } = render(<CustomerLove products={[]} entries={entries} />);
  expect(screen.getByText('Featured customer')).toBeTruthy();
  expect(screen.queryByText('Another customer')).toBeNull();
  rerender(<CustomerLove products={[]} entries={entries} page />);
  expect(screen.getByText('Another customer')).toBeTruthy();
});
it('shows a compact "Loved by You" section with at most three stories led by a photo story', () => {
  const url = 'https://images.luviacreations.com/customer-reviews/story-0123456789abcdef.webp';
  const featured = [0, 1, 2, 3].map(index => ({ ...newTestimonial(), display_name: `Customer ${index}, Meerut`,
    quote: `Story ${index}`, featured: true, sort_order: index, product_ids: ['one'],
    ...(index === 1 ? { has_image: true, image_url: url, image_alt: 'Customer photo 1' } : {}) }));
  const product = { id: 'one', name: 'Rose Gajra' } as Product;
  render(<CustomerLove products={[product]} entries={featured} />);
  expect(screen.getByRole('heading', { name: 'Loved by You' })).toBeTruthy();
  const stories = screen.getAllByRole('figure');
  expect(stories.length).toBeLessThanOrEqual(3);
  expect(within(stories[0]).getByAltText('Customer photo 1').getAttribute('draggable')).toBe('false');
  expect(within(stories[0]).getByRole('link', { name: 'Shop Rose Gajra' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Read more customer stories' }).getAttribute('href')).toBe('/customer-love/');
  expect(screen.queryByText(/★/)).toBeNull();
});
it('rotates homepage stories daily when more than three are featured', () => {
  const featured = [0, 1, 2, 3].map(index => ({ ...newTestimonial(), display_name: `Customer ${index}`, featured: true }));
  expect(pickHomeStories(featured, 0).map(entry => entry.display_name)).toEqual(['Customer 0', 'Customer 1', 'Customer 2']);
  expect(pickHomeStories(featured, 1).map(entry => entry.display_name)).toEqual(['Customer 1', 'Customer 2', 'Customer 3']);
  expect(pickHomeStories(featured, 3).map(entry => entry.display_name)).toEqual(['Customer 3', 'Customer 0', 'Customer 1']);
  expect(pickHomeStories(featured.slice(0, 2), 1).map(entry => entry.display_name)).toEqual(['Customer 0', 'Customer 1']);
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
