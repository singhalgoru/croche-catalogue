import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CartManager from './CartManager';

vi.mock('../../services/cart', () => ({
  fetchAdminCarts: async () => [{
    id: 'cart', userId: 'owner', reference: 'CRT-TEST', status: 'active',
    createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z',
    expiresAt: '2026-11-10T00:00:00Z', whatsappStartedAt: null,
    items: [], networkDetails: { ipAddress: '203.0.113.9', capturedAt: '2026-10-10T00:00:00Z',
      location: { city: 'Meerut', region: 'Uttar Pradesh', country: 'India', countryCode: 'IN', provider: 'geolite2' } },
  }],
  fetchCartSessionBlocks: async () => [],
  deleteAdminCart: vi.fn(), setCartSessionBlocked: vi.fn(),
}));
afterEach(cleanup);
it('shows a compact approximate location without the IP or lengthy explanation', async () => {
  render(<CartManager />);
  await screen.findByText('1 active cart from the last 30 days');
  fireEvent.click(screen.getByRole('button', { name: /Anonymous cart activity/ }));
  expect(screen.queryByText(/203.0.113.9/)).toBeNull();
  expect(screen.queryByText(/not a verified identity or location/)).toBeNull();
  expect(screen.queryByText(/mobile networks and VPNs/)).toBeNull();
  expect(screen.getByText('Approx. location: Meerut, Uttar Pradesh, India')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'MaxMind' }).getAttribute('href')).toBe('https://www.maxmind.com');
});
