import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CustomerSummary from './CustomerSummary';
import { fetchAdminCustomerSummary } from '../../services/customer';
import type { AdminCustomerSummary } from '../../types/customer';
import { changeAdminUser } from '../../services/adminUsers';

vi.mock('../../services/customer', () => ({ fetchAdminCustomerSummary: vi.fn() }));
vi.mock('../../services/adminUsers', () => ({ changeAdminUser: vi.fn() }));
const summary: AdminCustomerSummary = {
  total: 2, verified: 1, pendingActivation: 1, welcomeEmailsSent: 1,
  customers: [{ id: 'buyer', email: 'buyer@example.test', name: 'Buyer', phone: '9876543210',
    city: 'Delhi', pincode: '110001', registeredAt: '2026-10-10T12:00:00Z', lastSignInAt: null,
    verified: true, welcomeStatus: 'sent', suspended: false, canManageAccount: true }],
};
beforeEach(() => { vi.mocked(fetchAdminCustomerSummary).mockReset().mockResolvedValue(summary); vi.mocked(changeAdminUser).mockReset(); });
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
it.each([false, true])('confirms customer suspension/restoration with current admin password (suspended=%s)', async suspended => {
  vi.mocked(fetchAdminCustomerSummary).mockResolvedValue({ ...summary, customers: [{ ...summary.customers[0], suspended }] });
  vi.mocked(changeAdminUser).mockResolvedValue('Account access updated.');
  render(<CustomerSummary />);
  const action = await screen.findByRole('button', { name: suspended ? 'Re-enable account' : 'Temporarily disable account' });
  await waitFor(() => expect(action.hasAttribute('disabled')).toBe(false));
  fireEvent.click(action);
  const form = screen.getByRole('form', { name: 'Customer account access' });
  fireEvent.change(within(form).getByLabelText('Reason (internal)'), { target: { value: 'Customer reported login fraud.' } });
  fireEvent.change(within(form).getByLabelText('Your current admin password'), { target: { value: 'current' } });
  expect(within(form).getByLabelText('Your current admin password').getAttribute('type')).toBe('password');
  fireEvent.click(within(form).getByLabelText('Show admin password'));
  expect(within(form).getByLabelText('Your current admin password').getAttribute('type')).toBe('text');
  fireEvent.submit(form);
  expect(await screen.findByText('Account access updated.')).toBeTruthy();
  expect(changeAdminUser).toHaveBeenCalledWith({ action: suspended ? 'restore-customer' : 'suspend-customer',
    id: 'buyer', reason: 'Customer reported login fraud.' }, 'current');
  expect(screen.queryByRole('form', { name: 'Customer account access' })).toBeNull();
});
it('clears the admin password on failure and does not claim success', async () => {
  vi.mocked(changeAdminUser).mockRejectedValue(new Error('Wrong admin password.'));
  render(<CustomerSummary />);
  const action = await screen.findByRole('button', { name: 'Temporarily disable account' });
  await waitFor(() => expect(action.hasAttribute('disabled')).toBe(false));
  fireEvent.click(action);
  fireEvent.change(screen.getByLabelText('Reason (internal)'), { target: { value: 'Security report' } });
  fireEvent.change(screen.getByLabelText('Your current admin password'), { target: { value: 'wrong' } });
  fireEvent.click(screen.getByLabelText('Show admin password'));
  fireEvent.submit(screen.getByRole('form', { name: 'Customer account access' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Wrong admin password.');
  await waitFor(() => expect(screen.getByLabelText('Your current admin password')).toHaveProperty('value', ''));
  expect(screen.getByLabelText('Your current admin password').getAttribute('type')).toBe('password');
});
it('does not expose suspension controls for protected admin accounts', async () => {
  vi.mocked(fetchAdminCustomerSummary).mockResolvedValue({ ...summary, customers: [{ ...summary.customers[0], canManageAccount: false }] });
  render(<CustomerSummary />);
  await screen.findByRole('article');
  expect(screen.queryByRole('button', { name: 'Temporarily disable account' })).toBeNull();
});
