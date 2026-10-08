import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OrderingGuide from './OrderingGuide';
import Footer from './Footer';
import { trackContactClick } from '../services/analytics';

vi.mock('../services/analytics', () => ({ trackContactClick: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('OrderingGuide', () => {
  it('explains the order request, confirmation, payment and delivery steps without promising timelines', () => {
    render(<OrderingGuide />);
    expect(screen.getByRole('region', { name: 'How ordering and delivery work' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText(/sending a message does not confirm an order/)).toBeTruthy();
    expect(screen.getByText(/Your order is confirmed only after we confirm it with you/)).toBeTruthy();
    expect(screen.getByText(/Please agree on the total and dispatch estimate with us before paying/)).toBeTruthy();
    expect(screen.getByText(/does not complete a purchase or take payment/)).toBeTruthy();
    expect(screen.getByText(/Displayed product prices include GST/)).toBeTruthy();
  });

  it('shows the return policy only once in the footer alongside the guide', () => {
    render(<><OrderingGuide /><Footer /></>);
    const links = screen.getAllByRole('link', { name: 'Return and refund policy' });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/return-policy/');
    expect(links[0].closest('footer')).not.toBeNull();
  });

  it('uses the dedicated contact links and tracks contact actions', () => {
    render(<OrderingGuide />);
    const whatsapp = screen.getByRole('link', { name: 'Ask us on WhatsApp' });
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(whatsapp.getAttribute('rel')).toBe('noopener noreferrer');
    fireEvent.click(whatsapp);
    expect(trackContactClick).toHaveBeenCalledWith('whatsapp', 'ordering_guide');
    const email = screen.getByRole('link', { name: 'Email about an order' });
    expect(email.getAttribute('href')).toBe('mailto:orders@luviacreations.com');
    fireEvent.click(email);
    expect(trackContactClick).toHaveBeenCalledWith('email', 'ordering_guide');
  });

  it('connects ordering help and footer navigation to the static information pages', () => {
    render(<><OrderingGuide /><Footer /></>);
    expect(screen.getByRole('link', { name: 'Read the ordering FAQ' }).getAttribute('href')).toBe('/faq/');
    expect(screen.getByRole('link', { name: 'Explore collections' }).getAttribute('href')).toBe('/collections/');
    expect(screen.getByRole('link', { name: 'About & contact' }).getAttribute('href')).toBe('/about/');
  });
});
