import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import InternationalQuote from './InternationalQuote';
import type { Product } from '../types/product';
import { buildInternationalQuote, type InternationalQuoteDetails } from '../utils/internationalQuote';
import { trackContactClick } from '../services/analytics';

vi.mock('../services/analytics', () => ({ trackContactClick: vi.fn() }));
const products: Product[] = [
  { id: 'p1', publicSlug: 'bunny', name: 'Bunny & friend', category: 'Toys', price: 500, description: '', color: '', image: '', inStock: true, variants: [] },
  { id: 'p2', publicSlug: 'clip', name: 'Rose Clip', category: 'Hair', price: null, description: '', color: '', image: '', inStock: false, variants: [], minimumOrderQuantity: 3 },
];
const details: InternationalQuoteDetails = {
  name: ' Asha ', email: 'asha@example.test', phone: '', country: 'United Kingdom', city: 'London',
  state: '', postalCode: 'SW1A 1AA', address: '', notes: 'Blue & white\nBefore December',
};
afterEach(() => { cleanup(); vi.clearAllMocks(); window.history.replaceState(null, '', '/'); });

function fillDetails() {
  for (const [label, value] of [
    ['Your name', details.name], ['Reply email', details.email], ['Country', details.country],
    ['City', details.city], ['ZIP / postal code', details.postalCode],
    ['Colours, customisation, delivery date or other notes (optional)', details.notes],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

it('preselects a linked product and prepares matching email/WhatsApp drafts with multiple quantities and optional phone omitted', () => {
  window.history.replaceState(null, '', '/international-quote/?product=p1');
  render(<InternationalQuote products={products} isLoading={false} loadError={null} />);
  expect((screen.getByLabelText('Product 1') as HTMLSelectElement).value).toBe('p1');
  fireEvent.change(screen.getByLabelText('Quantity 1'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add another product' }));
  fireEvent.change(screen.getByLabelText('Product 2'), { target: { value: 'p2' } });
  expect((screen.getByLabelText('Quantity 2') as HTMLInputElement).value).toBe('3');
  expect((within(screen.getByLabelText('Product 2')).getByRole('option', { name: 'Bunny & friend' }) as HTMLOptionElement).disabled).toBe(true);
  fillDetails();
  fireEvent.submit(screen.getByRole('form', { name: 'International quote request' }));
  const email = screen.getByRole('link', { name: 'Send via email' });
  const whatsapp = screen.getByRole('link', { name: 'Send via WhatsApp' });
  const emailUrl = new URL(email.getAttribute('href')!);
  const whatsappUrl = new URL(whatsapp.getAttribute('href')!);
  expect(emailUrl.pathname).toBe('orders@luviacreations.com');
  expect(emailUrl.searchParams.get('subject')).toBe('Luvia Creations | International Order Quote Request');
  expect(whatsappUrl.pathname).toBe('/919205907350');
  expect(whatsappUrl.searchParams.get('text')).toBe(emailUrl.searchParams.get('body'));
  const body = emailUrl.searchParams.get('body')!;
  for (const text of ['Bunny & friend x 2', `${window.location.origin}/p/bunny/`, 'Rose Clip x 3',
    'Country: United Kingdom', 'City: London', 'ZIP / postal code: SW1A 1AA', 'Contact name: Asha',
    'Phone / WhatsApp (optional): Not provided', details.notes, 'does not confirm an order']) expect(body).toContain(text);
  expect(screen.getByText(/does not send it automatically or save/)).toBeTruthy();
  expect(trackContactClick).not.toHaveBeenCalled();
  for (const link of [email, whatsapp]) {
    link.addEventListener('click', event => event.preventDefault());
    fireEvent.click(link);
  }
  expect(trackContactClick).toHaveBeenCalledWith('email', 'international_quote');
  expect(trackContactClick).toHaveBeenCalledWith('whatsapp', 'international_quote');
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Oxford' } });
  expect(screen.queryByRole('link', { name: 'Send via email' })).toBeNull();
  fireEvent.submit(screen.getByRole('form', { name: 'International quote request' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove item 1' }));
  expect(screen.queryByRole('link', { name: 'Send via WhatsApp' })).toBeNull();
  expect((screen.getByLabelText('Product 1') as HTMLSelectElement).value).toBe('p2');
});

it('reports missing destination/contact fields and invalid or unavailable products instead of creating incomplete drafts', () => {
  render(<InternationalQuote products={products} isLoading={false} loadError={null} />);
  fireEvent.submit(screen.getByRole('form', { name: 'International quote request' }));
  expect(screen.getByRole('alert').textContent).toContain('Please complete');
  fillDetails();
  fireEvent.submit(screen.getByRole('form', { name: 'International quote request' }));
  expect(screen.getByRole('alert').textContent).toContain('current catalogue product');
  fireEvent.change(screen.getByLabelText('Product 1'), { target: { value: 'p1' } });
  fireEvent.change(screen.getByLabelText('Quantity 1'), { target: { value: '1.5' } });
  fireEvent.submit(screen.getByRole('form', { name: 'International quote request' }));
  expect(screen.getByRole('alert').textContent).toContain('whole-number quantity');
  expect(screen.queryByRole('link', { name: 'Send via email' })).toBeNull();
});

it('disables submission during catalogue loading/errors and provides a contact fallback for an empty catalogue', () => {
  const view = render(<InternationalQuote products={products} isLoading loadError={null} />);
  expect((screen.getByRole('button', { name: 'Prepare quote request' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.submit(screen.getByRole('form', { name: 'International quote request' }));
  expect(screen.getByRole('alert').textContent).toContain('catalogue to load successfully');
  view.rerender(<InternationalQuote products={products} isLoading={false} loadError="Unable to load" />);
  expect((screen.getByLabelText('Product 1') as HTMLSelectElement).disabled).toBe(true);
  view.rerender(<InternationalQuote products={[]} isLoading={false} loadError={null} />);
  expect(screen.getByRole('status').textContent).toContain('No products');
  expect(screen.getByRole('link', { name: 'orders@luviacreations.com' }).getAttribute('href')).toBe('mailto:orders@luviacreations.com');
});

it('validates whole quantities, minimum quantities, duplicate/stale selections and whitespace/email at the message boundary', () => {
  for (const quantity of ['', '0', '-1', '1.5', 'Infinity', '9007199254740992']) {
    expect(() => buildInternationalQuote(details, [{ productId: 'p1', quantity }], products)).toThrow('whole-number quantity');
  }
  expect(() => buildInternationalQuote(details, [{ productId: 'p2', quantity: '2' }], products)).toThrow('at least 3');
  expect(() => buildInternationalQuote(details, [], products)).toThrow('at least one product');
  expect(() => buildInternationalQuote(details, [{ productId: 'gone', quantity: '1' }], products)).toThrow('current catalogue product');
  expect(() => buildInternationalQuote(details, [{ productId: 'p1', quantity: '1' }, { productId: 'p1', quantity: '2' }], products)).toThrow('appear once');
  expect(() => buildInternationalQuote({ ...details, country: ' ' }, [{ productId: 'p1', quantity: '1' }], products)).toThrow('Please complete');
  expect(() => buildInternationalQuote({ ...details, email: 'bad' }, [{ productId: 'p1', quantity: '1' }], products)).toThrow('valid reply email');
  const draft = buildInternationalQuote({ ...details, phone: '+44 20 1234 5678', state: 'Greater London', postalCode: 'N/A' }, [{ productId: 'p1', quantity: '1' }], products);
  expect(draft.body).toContain('Phone / WhatsApp (optional): +44 20 1234 5678');
  expect(draft.body).toContain('State / province / region: Greater London');
  expect(draft.body).toContain('ZIP / postal code: N/A');
});
