import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CouponGenerator from './CouponGenerator';
const { fetchCoupons, generate, setEnabled, remove } = vi.hoisted(() => ({
  fetchCoupons: vi.fn(), generate: vi.fn(), setEnabled: vi.fn(), remove: vi.fn(),
}));
vi.mock('../../services/customer', () => ({
  fetchCampaignCoupons: fetchCoupons, generateCampaignCoupon: generate, setCampaignCouponEnabled: setEnabled,
  deleteCampaignCoupon: remove,
}));
const coupon = { id: 'coupon', code: 'LUVIA-0123456789ABCDEF', percent: 10, max_discount_rupees: 100,
  minimum_subtotal_rupees: 500, max_redemptions: 1, first_order_only: false, enabled: true,
  expires_at: '2026-11-10T08:00:00Z' };
beforeEach(() => {
  vi.clearAllMocks(); vi.restoreAllMocks(); fetchCoupons.mockResolvedValue([]); generate.mockResolvedValue(coupon);
  setEnabled.mockResolvedValue(undefined); remove.mockResolvedValue(undefined);
});
afterEach(cleanup);
it('generates a random coupon with explicit local expiry, usage limit and first-order eligibility', async () => {
  render(<CouponGenerator />);
  fireEvent.change(screen.getByLabelText('Coupon expiry (your local time)'), { target: { value: '2026-11-10T13:30' } });
  fireEvent.change(screen.getByLabelText('Total coupon uses'), { target: { value: '5' } });
  fireEvent.click(screen.getByLabelText('First order only'));
  fireEvent.click(screen.getByRole('button', { name: 'Generate random coupon' }));
  await waitFor(() => expect(generate).toHaveBeenCalled());
  expect(generate).toHaveBeenCalledWith({ percent: 10, cap: 100, minimum: 500, maxUses: 5,
    firstOrder: true, expiresAt: new Date('2026-11-10T13:30').toISOString() });
  await waitFor(() => expect(screen.getByText(coupon.code)).toBeTruthy());
  expect(screen.getByRole('status').textContent).toContain('Expires');
});
it('shows errors instead of claiming generation succeeded', async () => {
  generate.mockRejectedValue(new Error('Expiry must be in the future.'));
  render(<CouponGenerator />);
  fireEvent.click(screen.getByRole('button', { name: 'Generate random coupon' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Expiry'));
  expect(screen.queryByRole('status')).toBeNull();
});
it('allows admins to disable a generated coupon without changing its expiry', async () => {
  fetchCoupons.mockResolvedValue([coupon]);
  render(<CouponGenerator />);
  await waitFor(() => expect(screen.getByText(coupon.code)).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Disable coupon' }));
  await waitFor(() => expect(setEnabled).toHaveBeenCalledWith(coupon.id, false));
  expect(screen.getByRole('status').textContent).toContain('disabled');
});
it('deletes an unused coupon only after confirmation', async () => {
  fetchCoupons.mockResolvedValue([coupon]);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(<CouponGenerator />);
  await waitFor(() => expect(screen.getByText(coupon.code)).toBeTruthy());
  const button = screen.getByRole('button', { name: `Delete coupon ${coupon.code}` });
  fireEvent.click(button);
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() => expect(remove).toHaveBeenCalledWith(coupon.id));
  await waitFor(() => expect(screen.queryByText(coupon.code)).toBeNull());
  expect(screen.getByRole('status').textContent).toContain('deleted');
  expect(confirm).toHaveBeenCalledTimes(2);
});
it('keeps a used coupon and explains why it cannot be deleted', async () => {
  fetchCoupons.mockResolvedValue([coupon]);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  remove.mockRejectedValue(new Error('Unable to delete coupon: This coupon has already been used on an order. Disable it instead.'));
  render(<CouponGenerator />);
  await waitFor(() => expect(screen.getByText(coupon.code)).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: `Delete coupon ${coupon.code}` }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Disable it instead'));
  expect(screen.getByText(coupon.code)).toBeTruthy();
});