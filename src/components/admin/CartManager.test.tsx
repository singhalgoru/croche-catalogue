import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CartManager from './CartManager';

vi.mock('../../services/cart', () => ({
  fetchAdminCarts: async () => [{
    id: 'cart', userId: 'owner', reference: 'CRT-TEST', status: 'active',
    createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z',
    expiresAt: '2026-11-10T00:00:00Z', whatsappStartedAt: null,
    items: [], networkDetails: { ipAddress: '203.0.113.9', capturedAt: '2026-10-10T00:00:00Z' },
  }],
  fetchCartSessionBlocks: async () => [],
  deleteAdminCart: vi.fn(), setCartSessionBlocked: vi.fn(),
}));
afterEach(cleanup);
it('shows the network address only in the expanded admin cart view with its limitations', async () => {
  render(<CartManager />);
  await screen.findByText('1 active cart from the last 30 days');
  fireEvent.click(screen.getByRole('button', { name: /Anonymous cart activity/ }));
  expect(screen.getByText(/Network IP: 203.0.113.9/)).toBeTruthy();
  expect(screen.getByText(/not a verified identity or location/)).toBeTruthy();
});
