import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProductDiscountManager from './ProductDiscountManager';
import { fetchManagedProducts, setProductDiscount, type ManagedProduct } from '../../services/products';
vi.mock('../../services/products', () => ({ fetchManagedProducts: vi.fn(), setProductDiscount: vi.fn() }));
const product: ManagedProduct = {
  id: 'p1', name: 'Rose', price: 500, showPrice: true, inStock: true, category: 'Decor', color: '',
  image: '', imagePath: '', description: '', variants: [], published: true, publishedAt: null, createdAt: '',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchManagedProducts).mockResolvedValue([product]);
  vi.mocked(setProductDiscount).mockResolvedValue(undefined);
});
afterEach(cleanup);
it('searches names and categories without losing the selected offer or submitting on Enter', async () => {
  vi.mocked(fetchManagedProducts).mockResolvedValue([
    product, { ...product, id: 'p2', name: 'Bunny', category: 'Toys', discountPercent: 15, published: false },
  ]);
  render(<ProductDiscountManager refreshKey={0} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Product discounts' }));
  await screen.findByRole('option', { name: 'Rose - No discount' });
  const search = screen.getByRole('searchbox', { name: 'Search discount products' });
  fireEvent.change(search, { target: { value: '  bUnNy ' } });
  expect(screen.queryByRole('option', { name: 'Rose - No discount' })).toBeNull();
  expect(screen.getByRole('option', { name: 'Bunny - 15% off applied (hidden)' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Discount product'), { target: { value: 'p2' } });
  fireEvent.change(search, { target: { value: 'Decor' } });
  expect(screen.getByRole('option', { name: 'Rose - No discount' })).toBeTruthy();
  expect(screen.getByLabelText('Discount product')).toHaveProperty('value', 'p2');
  fireEvent.change(search, { target: { value: 'unmatched' } });
  expect(screen.getByText(/No matching products/)).toBeTruthy();
  expect(screen.getByLabelText('Discount product')).toHaveProperty('value', 'p2');
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(setProductDiscount).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(search).toHaveProperty('value', '');
  expect(screen.getByRole('option', { name: 'Rose - No discount' })).toBeTruthy();
});
it('rotates the decorative chevron as the panel opens and closes', async () => {
  render(<ProductDiscountManager refreshKey={0} onChanged={vi.fn()} />);
  const toggle = screen.getByRole('button', { name: 'Product discounts' });
  const arrow = toggle.querySelector('svg');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(arrow?.getAttribute('class')).not.toContain('rotate-180');
  fireEvent.click(toggle);
  await screen.findByRole('option', { name: 'Rose - No discount' });
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(arrow?.getAttribute('class')).toContain('rotate-180');
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(arrow?.getAttribute('class')).not.toContain('rotate-180');
});
it('applies and removes a selected product offer', async () => {
  const changed = vi.fn().mockResolvedValue(undefined);
  render(<ProductDiscountManager refreshKey={0} onChanged={changed} />);
  expect(fetchManagedProducts).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Product discounts' }));
  await screen.findByRole('option', { name: 'Rose - No discount' });
  fireEvent.change(screen.getByLabelText('Discount product'), { target: { value: 'p1' } });
  fireEvent.change(screen.getByLabelText('Discount percentage'), { target: { value: '20' } });
  vi.mocked(fetchManagedProducts).mockResolvedValue([{ ...product, price: 400, regularPrice: 500, discountPercent: 20 }]);
  fireEvent.click(screen.getByRole('button', { name: 'Apply product discount' }));
  expect(await screen.findByRole('status')).toHaveProperty('textContent', '20% product discount applied to Rose.');
  expect(setProductDiscount).toHaveBeenCalledWith('p1', 20);
  expect(screen.getByRole('option', { name: 'Rose - 20% off applied' })).toBeTruthy();
  vi.mocked(fetchManagedProducts).mockResolvedValue([product]);
  fireEvent.click(screen.getByRole('button', { name: 'Remove product discount' }));
  await waitFor(() => expect(setProductDiscount).toHaveBeenCalledWith('p1', 0));
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('option', { name: 'Rose - No discount' })).toBeTruthy();
});
it('reports rejected discounts without claiming success', async () => {
  vi.mocked(setProductDiscount).mockRejectedValue(new Error('Verify your admin access.'));
  render(<ProductDiscountManager refreshKey={0} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Product discounts' }));
  await screen.findByRole('option', { name: 'Rose - No discount' });
  fireEvent.change(screen.getByLabelText('Discount product'), { target: { value: 'p1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply product discount' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Verify your admin access.');
  expect(screen.queryByRole('status')).toBeNull();
});

it('previews post-discount variant margins from original prices and saved costs', async () => {
  vi.mocked(fetchManagedProducts).mockResolvedValue([{
    ...product, price: 400, regularPrice: 500, discountPercent: 20,
    priceDiscoveryInputs: { timeSpent: '1', timeUnit: 'hours', materialCost: '50',
      shippingCost: '50', packagingCost: '10', gstPercent: '5', targetMarginPercent: '45' },
    variants: [{ id: 'v1', name: 'Pink', price: 600, regularPrice: 750, color: '',
      inStock: true, availableQuantity: 5, image: '', imagePath: '', gallery: [] }],
  }]);
  render(<ProductDiscountManager refreshKey={0} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Product discounts' }));
  await screen.findByRole('option', { name: 'Rose - 20% off applied' });
  fireEvent.change(screen.getByLabelText('Discount product'), { target: { value: 'p1' } });
  expect(screen.getByText('Regular: ₹750 · Offer: ₹600')).toBeTruthy();
  expect(screen.getByText('Post-discount margin: 60.8%')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Discount percentage'), { target: { value: '90' } });
  expect(screen.getByText('Regular: ₹750 · Offer: ₹75')).toBeTruthy();
  expect(screen.getByText(/Estimated profit: -₹/)).toBeTruthy();
  expect(setProductDiscount).not.toHaveBeenCalled();
});

it('does not reuse the saved regular-price margin when cost inputs are missing', async () => {
  vi.mocked(fetchManagedProducts).mockResolvedValue([{ ...product, profitMarginPercent: 45 }]);
  render(<ProductDiscountManager refreshKey={0} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Product discounts' }));
  await screen.findByRole('option', { name: 'Rose - No discount' });
  fireEvent.change(screen.getByLabelText('Discount product'), { target: { value: 'p1' } });
  expect(screen.getByText(/Cost details needed/)).toBeTruthy();
  expect(screen.queryByText('Post-discount margin: 45.0%')).toBeNull();
});
