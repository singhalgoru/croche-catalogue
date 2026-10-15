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
it('applies and removes a selected product offer', async () => {
  const changed = vi.fn().mockResolvedValue(undefined);
  render(<ProductDiscountManager refreshKey={0} onChanged={changed} />);
  expect(fetchManagedProducts).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Product discounts' }));
  await screen.findByRole('option', { name: 'Rose' });
  fireEvent.change(screen.getByLabelText('Discount product'), { target: { value: 'p1' } });
  fireEvent.change(screen.getByLabelText('Discount percentage'), { target: { value: '20' } });
  vi.mocked(fetchManagedProducts).mockResolvedValue([{ ...product, price: 400, regularPrice: 500, discountPercent: 20 }]);
  fireEvent.click(screen.getByRole('button', { name: 'Apply product discount' }));
  expect(await screen.findByRole('status')).toHaveProperty('textContent', '20% product discount applied to Rose.');
  expect(setProductDiscount).toHaveBeenCalledWith('p1', 20);
  fireEvent.click(screen.getByRole('button', { name: 'Remove product discount' }));
  await waitFor(() => expect(setProductDiscount).toHaveBeenCalledWith('p1', 0));
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
});
it('reports rejected discounts without claiming success', async () => {
  vi.mocked(setProductDiscount).mockRejectedValue(new Error('Verify your admin access.'));
  render(<ProductDiscountManager refreshKey={0} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Product discounts' }));
  await screen.findByRole('option', { name: 'Rose' });
  fireEvent.change(screen.getByLabelText('Discount product'), { target: { value: 'p1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply product discount' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Verify your admin access.');
  expect(screen.queryByRole('status')).toBeNull();
});
