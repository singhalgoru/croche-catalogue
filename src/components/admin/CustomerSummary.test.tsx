import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CustomerSummary from './CustomerSummary';
import { fetchAdminCustomerSummary } from '../../services/customer';
import type { AdminCustomerSummary } from '../../types/customer';

vi.mock('../../services/customer', () => ({ fetchAdminCustomerSummary: vi.fn() }));
const summary: AdminCustomerSummary = {
  total: 2, verified: 1, pendingActivation: 1, welcomeEmailsSent: 1,
  customers: [{ id: 'buyer', email: 'buyer@example.test', name: 'Buyer', phone: '9876543210',
    city: 'Delhi', pincode: '110001', registeredAt: '2026-10-10T12:00:00Z', lastSignInAt: null,
    verified: true, welcomeStatus: 'sent' }],
};
beforeEach(() => { vi.mocked(fetchAdminCustomerSummary).mockReset().mockResolvedValue(summary); });
afterEach(cleanup);
it('shows registration metrics and customer details', async () => {
  render(<CustomerSummary />);
  expect(await screen.findByRole('article', { name: 'Customer buyer@example.test' })).toBeTruthy();
  expect(screen.getByText('Total customers')).toBeTruthy();
  expect(screen.getByText('Pending activation')).toBeTruthy();
  expect(screen.getByText('Welcome email: Sent')).toBeTruthy();
  expect(screen.getByText('Last sign-in: Not yet')).toBeTruthy();
  expect(screen.getByText(/9876543210/)).toBeTruthy();
});
it('shows an empty summary', async () => {
  vi.mocked(fetchAdminCustomerSummary).mockResolvedValue({ total: 0, verified: 0, pendingActivation: 0, welcomeEmailsSent: 0, customers: [] });
  render(<CustomerSummary />);
  expect(await screen.findByText('No registered customers yet.')).toBeTruthy();
});
it('shows access failures and lets admins retry', async () => {
  vi.mocked(fetchAdminCustomerSummary).mockRejectedValueOnce(new Error('Admin access required.'));
  render(<CustomerSummary />);
  expect((await screen.findByRole('alert')).textContent).toBe('Admin access required.');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh customers' }).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh customers' }));
  expect(await screen.findByText('Welcome email: Sent')).toBeTruthy();
});
it('loads subsequent pages using the server pagination', async () => {
  vi.mocked(fetchAdminCustomerSummary).mockResolvedValue({ ...summary, total: 51 });
  render(<CustomerSummary />);
  const next = await screen.findByRole('button', { name: 'Next customers' });
  await waitFor(() => expect(next.hasAttribute('disabled')).toBe(false));
  fireEvent.click(next);
  await waitFor(() => expect(fetchAdminCustomerSummary).toHaveBeenLastCalledWith(50));
});
