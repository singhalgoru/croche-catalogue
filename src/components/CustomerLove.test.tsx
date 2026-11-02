import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CustomerLove from './CustomerLove';
import { newTestimonial, fetchTestimonials } from '../services/customerLove';
vi.mock('../services/customerLove', async original => ({ ...await original<object>(), fetchTestimonials: vi.fn() }));
vi.mock('./RotatingCarousel', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const entries = [
  { ...newTestimonial(), display_name: 'Featured customer', quote: 'A wonderful handmade keepsake.', featured: true, product_id: 'one' },
  { ...newTestimonial(), display_name: 'Another customer', quote: 'This is a lovely gift.', featured: false, product_id: 'two' },
];
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
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
it('shows load errors and retries rather than pretending there are no testimonials', async () => {
  vi.mocked(fetchTestimonials).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(entries);
  render(<CustomerLove products={[]} />);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Retry customer stories' }));
  expect(await screen.findByText('Featured customer')).toBeTruthy();
});
