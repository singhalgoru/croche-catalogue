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
  it('links to the published return policy', () => {
    render(<Footer />);
    expect(screen.getByRole('link', { name: 'Return and refund policy' }).getAttribute('href'))
      .toBe('/return-policy/');
  });

  it('shows the WhatsApp mobile number as a direct WhatsApp link', () => {
    render(<Footer />);
    const mobile = screen.getByRole('link', { name: '+91 92059 07350' });
    expect(mobile.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/919205907350\?text=/);
  });

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
