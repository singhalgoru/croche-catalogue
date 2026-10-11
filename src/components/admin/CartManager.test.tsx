import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CartManager from './CartManager';
import { fetchAdminCarts, redeemAdminCartCoupon } from '../../services/cart';

vi.mock('../../services/cart', () => ({
  fetchAdminCarts: vi.fn(async () => [{
    id: 'cart', userId: 'owner', reference: 'CRT-TEST', status: 'active',
    createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z',
    expiresAt: '2026-11-10T00:00:00Z', whatsappStartedAt: null,
    welcomeCouponCode: 'ILOVELUVIA',
    deliveryDetails: { name: 'Buyer', phone: '9876543210', email: 'buyer@example.invalid',
      addressLine1: '12 Test Street', addressLine2: '', city: 'Delhi', state: 'Delhi', pincode: '110001' },
    items: [], networkDetails: { ipAddress: '203.0.113.9', capturedAt: '2026-10-10T00:00:00Z',
      location: { city: 'Meerut', region: 'Uttar Pradesh', country: 'India', countryCode: 'IN', provider: 'geolite2' } },
  }]),
  fetchCartSessionBlocks: async () => [],
  deleteAdminCart: vi.fn(), setCartSessionBlocked: vi.fn(),
  redeemAdminCartCoupon: vi.fn().mockResolvedValue(undefined),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('shows the recorded network IP alongside historical approximate location', async () => {
  render(<CartManager />);
  await screen.findByText('1 active cart from the last 30 days');
  fireEvent.click(screen.getByRole('button', { name: /Customer cart activity/ }));
  expect(screen.getByText('Network IP: 203.0.113.9')).toBeTruthy();
  expect(screen.queryByText(/not a verified identity or location/)).toBeNull();
  expect(screen.queryByText(/mobile networks and VPNs/)).toBeNull();
  expect(screen.getByText('Approx. location: Meerut, Uttar Pradesh, India')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'MaxMind' }).getAttribute('href')).toBe('https://www.maxmind.com');
});

it.each(['2001:db8:1234:5678:abcd:ef01:2345:6789', null])('shows IP-only capture or missing metadata (%s)', async ipAddress => {
  const [cart] = await fetchAdminCarts();
  vi.mocked(fetchAdminCarts).mockResolvedValueOnce([{
    ...cart, networkDetails: ipAddress ? { ipAddress, capturedAt: '2026-10-11T00:00:00Z', location: null } : null,
  }]);
  render(<CartManager />);
  await screen.findByText('1 active cart from the last 30 days');
  fireEvent.click(screen.getByRole('button', { name: /Customer cart activity/ }));
  const ip = screen.getByText(`Network IP: ${ipAddress ?? 'Not recorded'}`);
  expect(ip.className).toContain('break-all');
  if (ipAddress) expect(screen.getByText('Approx. location: Unavailable')).toBeTruthy();
});

it('requires explicit paid-order confirmation before recording an offline coupon use', async () => {
  render(<CartManager />);
  await screen.findByText('1 active cart from the last 30 days');
  fireEvent.click(screen.getByRole('button', { name: /Customer cart activity/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Mark coupon used for paid offline order' }));
  expect(redeemAdminCartCoupon).not.toHaveBeenCalled();
  expect(screen.getByText(/does not charge money or update stock/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm paid-order coupon use' }));
  await waitFor(() => expect(redeemAdminCartCoupon).toHaveBeenCalledWith('cart'));
});

it('reports an offline coupon redemption failure instead of claiming success', async () => {
  vi.mocked(redeemAdminCartCoupon).mockRejectedValueOnce(new Error('Coupon already used.'));
  render(<CartManager />);
  await screen.findByText('1 active cart from the last 30 days');
  fireEvent.click(screen.getByRole('button', { name: /Customer cart activity/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Mark coupon used for paid offline order' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm paid-order coupon use' }));
  expect(await screen.findByText('Coupon already used.')).toBeTruthy();
});
