import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MaterialPurchaseSnapshot from './MaterialPurchaseSnapshot';

const { fetchPurchases } = vi.hoisted(() => ({ fetchPurchases: vi.fn() }));
vi.mock('../../services/materialPurchases', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/materialPurchases')>(), fetchMaterialPurchases: fetchPurchases,
}));
vi.mock('../../utils/date', () => ({ localDate: () => '2026-11-15' }));
afterEach(cleanup);

it('starts collapsed and shows the selected purchase month with separate payment totals', async () => {
  fetchPurchases.mockResolvedValue([
    { id: '1', purchased_on: '2026-11-01', material: 'Yarn', total: 120, payment_status: 'Paid' },
    { id: '2', purchased_on: '2026-11-02', material: 'yarn', total: 50, payment_status: 'Unpaid' },
    { id: '3', purchased_on: '2026-10-01', material: 'Hook', total: 25, payment_status: 'Paid' },
  ]);
  render(<MaterialPurchaseSnapshot refreshKey={1} />);
  const toggle = screen.getByRole('button', { name: 'Material purchase snapshot' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect((await screen.findByText(/Purchase value:/)).textContent).toContain('Paid: ₹120.00 · Unpaid: ₹50.00');
  expect(screen.getByText('Yarn: ₹170.00')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Material purchase month'), { target: { value: '2026-10' } });
  expect(screen.getByText('Hook: ₹25.00')).toBeTruthy();
});

it('shows a loading error rather than zero totals and supports retry', async () => {
  fetchPurchases.mockRejectedValueOnce(new Error('Access denied')).mockResolvedValueOnce([]);
  render(<MaterialPurchaseSnapshot refreshKey={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Material purchase snapshot' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Access denied');
  expect(screen.queryByText(/Purchase value:/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh materials' }));
  expect(await screen.findByText(/Purchase value:/)).toBeTruthy();
});
