import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdminUsers from './AdminUsers';
const { list, change } = vi.hoisted(() => ({ list: vi.fn(), change: vi.fn() }));
vi.mock('../../services/adminUsers', () => ({ fetchAdminUsers: list, changeAdminUser: change }));
const owner = { id: 'owner', name: 'Owner', email: 'owner@example.test', isOwner: true, verified: true, createdAt: '' };
const member = { ...owner, id: 'member', name: 'Member', email: 'member@example.test', isOwner: false };
beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue({ currentUserId: 'owner', isOwner: true, users: [owner, member] });
  change.mockResolvedValue('Account updated.');
});
afterEach(cleanup);
async function open() {
  render(<AdminUsers />);
  expect(list).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Admin users' }));
  await screen.findByText(member.email);
}
it('loads on expansion, protects owner removal and requires password for adding an admin', async () => {
  await open();
  expect(screen.queryByRole('button', { name: `Remove access for ${owner.email}` })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Add admin user' }));
  fireEvent.change(screen.getByLabelText('Admin email'), { target: { value: 'new@example.test' } });
  fireEvent.change(screen.getByLabelText('Admin name'), { target: { value: 'New Admin' } });
  fireEvent.change(screen.getByLabelText('Your current password'), { target: { value: 'current' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Manage admin account' }));
  await waitFor(() => expect(change).toHaveBeenCalledWith({ action: 'add', email: 'new@example.test', name: 'New Admin' }, 'current'));
  await waitFor(() => expect(screen.queryByLabelText('Your current password')).toBeNull());
});
it('allows regular admins only their own password change', async () => {
  list.mockResolvedValue({ currentUserId: 'member', isOwner: false, users: [member] });
  await open();
  expect(screen.queryByRole('button', { name: 'Add admin user' })).toBeNull();
  expect(screen.queryByRole('button', { name: `Edit ${member.email}` })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: `Change password for ${member.email}` }));
  fireEvent.change(screen.getByLabelText('New admin password'), { target: { value: 'StrongPassword123' } });
  fireEvent.change(screen.getByLabelText('Confirm new admin password'), { target: { value: 'different' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Manage admin account' }));
  expect(screen.getByRole('alert').textContent).toContain('do not match');
  expect(change).not.toHaveBeenCalled();
});
it('requires explicit removal confirmation and preserves errors', async () => {
  await open();
  change.mockRejectedValue(new Error('Incorrect current password.'));
  fireEvent.click(screen.getByRole('button', { name: `Remove access for ${member.email}` }));
  expect(screen.getByText(/Use your own password, not this admin's password/)).toBeTruthy();
  expect(screen.getByLabelText('Your current password').getAttribute('aria-describedby')).toBe('admin-password-authorization-help');
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Your current password'), { target: { value: 'wrong' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm remove access' }));
  await screen.findByText('Incorrect current password.');
  expect(screen.getByLabelText('Your current password')).toHaveProperty('value', '');
});
