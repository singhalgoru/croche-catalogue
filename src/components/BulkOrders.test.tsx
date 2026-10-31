import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import BulkOrders from './BulkOrders';
import bulkOrders from '../content/bulkOrders.json';
import { trackContactClick } from '../services/analytics';

vi.mock('../services/analytics', () => ({ trackContactClick: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('keeps the homepage invitation compact with a single dedicated-page link', () => {
  render(<BulkOrders />);
  expect(screen.getByRole('region', { name: bulkOrders.title }).id).toBe('bulk-orders');
  expect(screen.getByText(bulkOrders.invitation)).toBeTruthy();
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Explore bulk gifting' }).getAttribute('href')).toBe('/bulk-orders/');
  expect(screen.queryByRole('form', { name: 'Bulk order email enquiry' })).toBeNull();
  expect(screen.queryByText(bulkOrders.description)).toBeNull();
  expect(screen.queryByText(bulkOrders.note)).toBeNull();
});

it('keeps direct email and prefilled WhatsApp enquiries on the dedicated page', () => {
  render(<BulkOrders presentation="page" />);
  const email = screen.getByRole('link', { name: bulkOrders.email });
  const emailUrl = new URL(email.getAttribute('href')!);
  expect(emailUrl.pathname).toBe('bulkorder@luviacreations.com');
  expect(emailUrl.searchParams.get('subject')).toBe(bulkOrders.subject);
  const whatsapp = screen.getByRole('link', { name: 'Enquire on WhatsApp' });
  const whatsappUrl = new URL(whatsapp.getAttribute('href')!);
  expect(whatsappUrl.origin).toBe('https://wa.me');
  expect(whatsappUrl.pathname).toBe('/919205907350');
  expect(whatsappUrl.searchParams.get('text')).toContain(bulkOrders.message);
  expect(whatsapp.getAttribute('rel')).toBe('noopener noreferrer');
  expect(screen.getByText(/Sending an enquiry does not confirm an order/)).toBeTruthy();
  for (const link of [email, whatsapp]) {
    expect(link.className).toContain('min-h-11');
    link.addEventListener('click', event => event.preventDefault());
    fireEvent.click(link);
  }
  expect(trackContactClick).toHaveBeenCalledWith('email', 'bulk_orders');
  expect(trackContactClick).toHaveBeenCalledWith('whatsapp', 'bulk_orders');
  expect(screen.getByRole('form', { name: 'Bulk order email enquiry' })).toBeTruthy();
});

it('prepares a branded email from the form without sending automatically and clears stale drafts on edits', () => {
  render(<BulkOrders presentation="page" />);
  expect(screen.getByRole('button', { name: 'Hide enquiry form' }).getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText(/does not send an email automatically/)).toBeTruthy();
  for (const [label, value] of [
    ['Your name', ' Asha '], ['Reply email', 'asha@example.test'],
    ['Products or gifting ideas', 'Rose charms'], ['Approximate quantity', '50'],
    ['Delivery country, city / postal code', 'Manesar 122050'],
    ['Company / organisation (optional)', 'Example & Co'],
    ['Budget per gift in INR (optional)', '250'],
    ['Required delivery date (optional)', '2026-12-01'],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Prepare email draft' }));
  const draft = screen.getByRole('link', { name: 'Open email draft' });
  const url = new URL(draft.getAttribute('href')!);
  expect(url.pathname).toBe(bulkOrders.email);
  expect(url.searchParams.get('subject')).toBe('Luvia Creations | Bulk Orders & Corporate Gifting Enquiry');
  const body = url.searchParams.get('body')!;
  for (const text of ['Hello Luvia Creations,', 'Contact name: Asha', 'Company / organisation: Example & Co',
    'Reply email: asha@example.test', 'Approximate quantity: 50', 'Budget per gift (INR): 250',
    'Delivery country, city / postal code: Manesar 122050', 'Required delivery date: 2026-12-01', 'Thank you,\r\nAsha']) {
    expect(body).toContain(text);
  }
  expect(trackContactClick).not.toHaveBeenCalled();
  draft.addEventListener('click', event => event.preventDefault());
  fireEvent.click(draft);
  expect(trackContactClick).toHaveBeenCalledWith('email', 'bulk_orders');
  fireEvent.change(screen.getByLabelText('Approximate quantity'), { target: { value: '100' } });
  expect(screen.queryByRole('link', { name: 'Open email draft' })).toBeNull();
});

it('rejects whitespace-only required fields instead of preparing an incomplete draft', () => {
  render(<BulkOrders presentation="page" />);
  fireEvent.submit(screen.getByRole('form', { name: 'Bulk order email enquiry' }));
  expect(screen.getByRole('alert').textContent).toContain('required fields');
  expect(screen.queryByRole('link', { name: 'Open email draft' })).toBeNull();
});
