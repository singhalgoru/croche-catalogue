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
  it('explains the three ordering steps and delivery confirmation without promising timelines', () => {
    render(<OrderingGuide />);
    expect(screen.getByRole('region', { name: 'How to order & delivery' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText(/Your order is confirmed with us/)).toBeTruthy();
    expect(screen.getByText(/confirm shipping charges and the estimated dispatch time before payment/)).toBeTruthy();
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
});
