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
  it('links every footer to bulk enquiries and only shows the section when requested', () => {
    const { rerender } = render(<Footer />);
    expect(screen.getByRole('link', { name: 'Bulk orders & corporate gifting' }).getAttribute('href')).toBe('/bulk-orders/');
    expect(screen.queryByRole('region', { name: 'Bulk Orders & Corporate Gifting' })).toBeNull();
    rerender(<Footer showBulkOrders />);
    expect(screen.getByRole('region', { name: 'Bulk Orders & Corporate Gifting' })).toBeTruthy();
  });
  it('can omit the collaboration invitation on the cart page', () => {
    render(<Footer showCollaboration={false} />);
    expect(screen.queryByRole('region', { name: 'Create with Luvia' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Work with Luvia' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Explore & support' })).toBeTruthy();
  });

  it('offers a collaboration section and a prefilled WhatsApp enquiry', () => {
    render(<Footer />);
    const section = screen.getByRole('region', { name: 'Create with Luvia' });
    expect(section.id).toBe('collaborate');
    expect(screen.getByRole('link', { name: 'Work with Luvia' }).getAttribute('href')).toBe('#collaborate');
    for (const name of ['Makers', 'Creators', 'Partners']) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    }
    expect(screen.getByText(/not an announcement of open jobs/)).toBeTruthy();
    const contact = screen.getByRole('link', { name: 'Introduce yourself' });
    const url = new URL(contact.getAttribute('href')!);
    expect(url.origin).toBe('https://wa.me');
    expect(url.searchParams.get('text')).toContain('maker, content creator or partner');
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
  it('keeps the feedback entry compact and links to a dedicated page', () => {
    render(<Footer />);
    expect(screen.getByRole('heading', { name: 'Explore & support' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: "Let's stay connected" })).toBeTruthy();
    const feedback = screen.getByRole('region', { name: 'Share feedback' });
    expect(feedback.className).not.toContain('bg-cream');
    const trigger = screen.getByRole('link', { name: 'Share feedback' });
    expect(trigger.getAttribute('href')).toBe('/?page=feedback');
    expect(trigger.className).toContain('min-h-11');
    expect(screen.queryByRole('form', { name: 'Share feedback form' })).toBeNull();
  });
  it('keeps mobile support accessible and toggles information without duplicating desktop links', () => {
    render(<Footer />);
    const toggle = screen.getByRole('button', { name: 'Help & information' });
    const information = document.getElementById(toggle.getAttribute('aria-controls')!);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(information?.className).toContain('hidden');
    expect(information?.className).toContain('md:grid');
    expect(screen.getByRole('link', { name: 'Contact us' }).getAttribute('href')).toBe('/about/');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(information?.className).not.toContain('hidden');
    expect(screen.getAllByRole('link', { name: 'Return and refund policy' })).toHaveLength(1);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the WhatsApp mobile number as a direct WhatsApp link', () => {
    render(<Footer />);
    expect(screen.getByText('Gurugram, Haryana, India')).toBeTruthy();
    const mobile = screen.getByRole('link', { name: '+91 92059 07350' });
    expect(mobile.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/919205907350\?text=/);
  });
  it('shows locally hosted card network logos with checkout availability guidance', () => {
    render(<Footer />);
    expect(screen.getByRole('region', { name: 'Payment methods' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Visa' }).getAttribute('src')).toBe('/images/payments/visa.svg');
    expect(screen.getByRole('img', { name: 'Mastercard' }).getAttribute('src')).toBe('/images/payments/mastercard.svg');
    expect(screen.getByRole('img', { name: 'American Express' }).getAttribute('src')).toBe('/images/payments/amex.svg');
    expect(screen.getByRole('img', { name: 'American Express' }).className).not.toMatch(/brightness-0|invert/);
    expect(screen.getByRole('img', { name: 'UPI' }).getAttribute('src')).toBe('/images/payments/upi.svg');
    expect(screen.getByRole('img', { name: 'RuPay' }).getAttribute('src')).toBe('/images/payments/rupay.svg');
    expect(screen.getByRole('region', { name: 'Payment methods' }).className).not.toContain('hidden');
    for (const name of ['UPI', 'Visa', 'Mastercard', 'American Express', 'RuPay']) {
      expect(screen.getByRole('img', { name }).className).toContain('max-w-11');
      expect(screen.getByRole('img', { name }).className).toContain('md:max-w-none');
    }
    expect(screen.getByText('We accept')).toBeTruthy();
    expect(screen.getByText('Wallet')).toBeTruthy();
    expect(screen.getByText(/Available payment methods are shown at checkout/)).toBeTruthy();
    const payments = screen.getByRole('region', { name: 'Payment methods' });
    const footer = screen.getByRole('contentinfo');
    expect(footer.lastElementChild?.lastElementChild?.textContent).toContain(`© ${new Date().getFullYear()} Luvia Creations.`);
    expect(payments.nextElementSibling).toBe(footer.lastElementChild?.lastElementChild);
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
