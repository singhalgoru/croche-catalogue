import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CouponGenerator from './CouponGenerator';
const { fetchCoupons, generate, setEnabled, remove, archive } = vi.hoisted(() => ({
  fetchCoupons: vi.fn(), generate: vi.fn(), setEnabled: vi.fn(), remove: vi.fn(), archive: vi.fn(),
}));
vi.mock('../../services/customer', () => ({
  fetchCampaignCoupons: fetchCoupons, generateCampaignCoupon: generate, setCampaignCouponEnabled: setEnabled,
  deleteCampaignCoupon: remove,
  setCampaignCouponArchived: archive,
}));
const coupon = { id: 'coupon', code: 'LUVIA-0123456789ABCDEF', percent: 10, max_discount_rupees: 100,
  minimum_subtotal_rupees: 500, max_redemptions: 1, first_order_only: false, enabled: true,
  expires_at: '2026-11-10T08:00:00Z', archived_at: null, used_count: 0, reserved_count: 0 };
beforeEach(() => {
  vi.clearAllMocks(); vi.restoreAllMocks(); fetchCoupons.mockResolvedValue([]); generate.mockResolvedValue(coupon);
  setEnabled.mockResolvedValue(undefined); remove.mockResolvedValue(undefined);
  archive.mockResolvedValue(undefined);
});
afterEach(cleanup);
const renderExpanded = () => {
  render(<CouponGenerator />);
  fireEvent.click(screen.getByRole('button', { name: 'Generate discount coupons' }));
};
it('starts collapsed and preserves the form when toggled', () => {
  render(<CouponGenerator />);
  const toggle = screen.getByRole('button', { name: 'Generate discount coupons' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('button', { name: 'Generate random coupon' })).toBeNull();
  fireEvent.click(toggle);
  fireEvent.change(screen.getByLabelText('Total coupon uses'), { target: { value: '5' } });
  fireEvent.click(toggle);
  expect(screen.queryByRole('button', { name: 'Generate random coupon' })).toBeNull();
  fireEvent.click(toggle);
  expect(screen.getByLabelText('Total coupon uses')).toHaveProperty('value', '5');
});
it('generates a random coupon with explicit local expiry, usage limit and first-order eligibility', async () => {
  renderExpanded();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate random coupon' })).toHaveProperty('disabled', false));
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
  renderExpanded();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate random coupon' })).toHaveProperty('disabled', false));
  fireEvent.click(screen.getByRole('button', { name: 'Generate random coupon' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Expiry'));
  expect(screen.queryByRole('status')).toBeNull();
});
it('allows admins to disable a generated coupon without changing its expiry', async () => {
  fetchCoupons.mockResolvedValue([coupon]);
  renderExpanded();
  await waitFor(() => expect(screen.getByText(coupon.code)).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Disable coupon' }));
  await waitFor(() => expect(setEnabled).toHaveBeenCalledWith(coupon.id, false));
  expect(screen.getByRole('status').textContent).toContain('disabled');
});
it('deletes an unused coupon only after confirmation', async () => {
  fetchCoupons.mockResolvedValue([coupon]);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  renderExpanded();
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
  renderExpanded();
  await waitFor(() => expect(screen.getByText(coupon.code)).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: `Delete coupon ${coupon.code}` }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Disable it instead'));
  expect(screen.getByText(coupon.code)).toBeTruthy();
});

it.each([
  [1, 0, 1, 'Used'],
  [1, 0, 3, 'Partially used · Enabled'],
  [0, 1, 1, 'Reserved'],
])('separates completed uses (%s) from reservations (%s) at limit %s', async (used_count, reserved_count, max_redemptions, label) => {
  fetchCoupons.mockResolvedValue([{ ...coupon, used_count, reserved_count, max_redemptions }]);
  renderExpanded();
  await screen.findByText(coupon.code);
  expect(screen.getByText(new RegExp(`Expires.*${label}`))).toBeTruthy();
  expect(screen.getByText(new RegExp(`Usage: ${used_count} of ${max_redemptions} used`))).toBeTruthy();
});

it('archives a used coupon without deletion and restores it disabled with usage retained', async () => {
  const used = { ...coupon, used_count: 1 };
  fetchCoupons.mockImplementation(async (archived: boolean) => archived ? [{ ...used, enabled: false, archived_at: '2026-10-11T17:00:00Z' }] : [used]);
  renderExpanded();
  await screen.findByText(coupon.code);
  fireEvent.click(screen.getByRole('button', { name: 'Archive coupon' }));
  await waitFor(() => expect(archive).toHaveBeenCalledWith(coupon.id, true));
  expect(remove).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByText(coupon.code)).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Archived coupons' }));
  await screen.findByText(coupon.code);
  expect(fetchCoupons).toHaveBeenLastCalledWith(true);
  expect(screen.getByText(/Archived · Used/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Enable coupon' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Restore coupon' }));
  await waitFor(() => expect(archive).toHaveBeenCalledWith(coupon.id, false));
  expect(screen.getByRole('status').textContent).toContain('remains disabled');
});

it('keeps the coupon visible and reports failed archival', async () => {
  fetchCoupons.mockResolvedValue([coupon]);
  archive.mockRejectedValue(new Error('Only catalogue admins can archive coupons.'));
  renderExpanded();
  await screen.findByText(coupon.code);
  fireEvent.click(screen.getByRole('button', { name: 'Archive coupon' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Only catalogue admins');
  expect(screen.getByText(coupon.code)).toBeTruthy();
});

it('refreshes usage from the server after a paid redemption', async () => {
  fetchCoupons.mockResolvedValueOnce([coupon]).mockResolvedValueOnce([{ ...coupon, used_count: 1 }]);
  renderExpanded();
  await screen.findByText(coupon.code);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh coupons' }));
  await screen.findByText(/Expires.*Used/);
  expect(screen.getByText('Usage: 1 of 1 used')).toBeTruthy();
});