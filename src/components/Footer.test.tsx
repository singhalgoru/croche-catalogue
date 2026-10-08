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
  it('offers a collaboration section and a prefilled WhatsApp enquiry', () => {
    render(<Footer />);
    const section = screen.getByRole('region', { name: 'Collaborate with Luvia' });
    expect(section.id).toBe('collaborate');
    expect(screen.getByRole('link', { name: 'Collaborate with us' }).getAttribute('href')).toBe('#collaborate');
    const contact = screen.getByRole('link', { name: 'Discuss a collaboration' });
    const url = new URL(contact.getAttribute('href')!);
    expect(url.origin).toBe('https://wa.me');
    expect(url.searchParams.get('text')).toContain('selling my handmade products');
    expect(url.searchParams.get('text')).toContain('My name / brand:');
    contact.addEventListener('click', event => event.preventDefault());
    fireEvent.click(contact);
    expect(trackContactClick).toHaveBeenCalledWith('whatsapp', 'collaboration');
  });
  it('groups policy and information links for mobile while keeping primary actions touch-friendly', () => {
    render(<Footer />);
    const nav = screen.getByRole('navigation', { name: 'Store information' });
    expect(nav.className).toContain('grid-cols-2');
    expect(nav.contains(screen.getByRole('link', { name: 'Return and refund policy' }))).toBe(true);
    for (const name of ['Contact on WhatsApp', 'Contact on Instagram', 'orders@luviacreations.com', 'hello@luviacreations.com']) {
      expect(screen.getByRole('link', { name }).className).toContain('min-h-11');
    }
  });
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

  it('uses accessible dark text on the WhatsApp green button', () => {
    render(<Footer />);
    expect(screen.getByRole('link', { name: 'Contact on WhatsApp' }).className).toContain('text-cocoa');
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
