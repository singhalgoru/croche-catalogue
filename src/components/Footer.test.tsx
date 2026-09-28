import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Footer from './Footer';
import { trackContactClick } from '../services/analytics';

vi.mock('../services/analytics', () => ({
  trackContactClick: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Footer', () => {
  it('offers distinct order and general enquiry email links', () => {
    render(<Footer />);

    const orders = screen.getByRole('link', { name: 'orders@luviacreations.com' });
    const hello = screen.getByRole('link', { name: 'hello@luviacreations.com' });

    expect(orders.getAttribute('href')).toBe('mailto:orders@luviacreations.com');
    expect(hello.getAttribute('href')).toBe('mailto:hello@luviacreations.com');

    orders.addEventListener('click', (event) => event.preventDefault());
    hello.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(orders);
    fireEvent.click(hello);
    expect(trackContactClick).toHaveBeenCalledWith('email', 'footer_orders');
    expect(trackContactClick).toHaveBeenCalledWith('email', 'footer_hello');
  });
});
