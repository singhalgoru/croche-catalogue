import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SellerOrderSummary from './SellerOrderSummary';
import { saveSellerOrderCosts, deleteSellerOrder, type SellerSale } from '../../services/sellerSales';
vi.mock('../../services/sellerSales',() => ({ saveSellerOrderCosts: vi.fn(),deleteSellerOrder: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const sale: SellerSale = {
  id: 'line',productId: null,productName: 'Rose',variantName: '',saleDate: '2026-10-23',channel: 'online',
  quantity: 2,unitPrice: 100,gstPercent: 0,materialCost: 10,labourCost: 10,packagingCost: 0,shippingCost: 0,
  gatewayFeePercent: 0,gatewayFeeGstPercent: 0,notes: '',createdAt: '',
  order: { id: 'order',reference: 'LUV-1',paymentOrderId: 'payment',packagingCost: 30,shippingCost: 100,
    shippingCollected: 0,shippingSource: 'courier',itemRevenue: 400 },
};
it('shows total multi-product order margin, persists a manual override once and refreshes',async () => {
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(<SellerOrderSummary sales={[sale,{ ...sale,id: 'second' }]} onChanged={refresh} />);
  expect(screen.getByText(/Estimated order profit:/).textContent).toContain('₹190 · margin 47.5%');
  fireEvent.change(screen.getByLabelText('Shipping source LUV-1'),{ target: { value: 'manual' } });
  fireEvent.change(screen.getByLabelText('Order shipping LUV-1'),{ target: { value: '80' } });
  fireEvent.change(screen.getByLabelText('Order packaging LUV-1'),{ target: { value: '20' } });
  fireEvent.click(screen.getByRole('button',{ name: 'Save order costs' }));
  await waitFor(() => expect(saveSellerOrderCosts).toHaveBeenCalledWith('order',20,80,'manual'));
  expect(refresh).toHaveBeenCalledTimes(1);
});
it('requires explicit confirmation before deleting the entire ledger order',async () => {
  render(<SellerOrderSummary sales={[sale]} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole('button',{ name: 'Delete whole order' }));
  expect(deleteSellerOrder).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{ name: 'Confirm delete order' }));
  await waitFor(() => expect(deleteSellerOrder).toHaveBeenCalledWith('order'));
});
it('preserves entered costs and surfaces backend failures',async () => {
  vi.mocked(saveSellerOrderCosts).mockRejectedValueOnce(new Error('Save failed'));
  const refresh = vi.fn();
  render(<SellerOrderSummary sales={[sale]} onChanged={refresh} />);
  fireEvent.click(screen.getByRole('button',{ name: 'Save order costs' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Save failed');
  expect(refresh).not.toHaveBeenCalled();
});
