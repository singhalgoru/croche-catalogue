import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ChangePassword from './ChangePassword';
const { change } = vi.hoisted(() => ({ change: vi.fn() }));
vi.mock('../services/customer', () => ({ changeCustomerPassword: change }));
beforeEach(() => { vi.clearAllMocks(); change.mockResolvedValue(undefined); });
afterEach(cleanup);
function open() {
  render(<ChangePassword />);
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'OldPassword123' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPassword123' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'NewPassword123' } });
}
it('saves passwords and clears the form with simple email notification wording', async () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
  expect((await screen.findByRole('status')).textContent).toContain('A notification will be sent to your email address for this change.');
  expect(change).toHaveBeenCalledWith('OldPassword123', 'NewPassword123', 'NewPassword123');
  expect(screen.queryByLabelText('Current password')).toBeNull();
});
it('keeps errors visible and clears sensitive inputs after a rejected change', async () => {
  open(); change.mockRejectedValue(new Error('Your current password is incorrect.'));
  fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
  expect((await screen.findByRole('alert')).textContent).toContain('incorrect');
  expect(screen.getByLabelText('Current password')).toHaveProperty('value', '');
  expect(screen.getByLabelText('New password')).toHaveProperty('value', '');
});
it('cancels without saving and clears the draft', () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel password change' }));
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(screen.getByLabelText('New password')).toHaveProperty('value', '');
  expect(change).not.toHaveBeenCalled();
});
it('reveals each password independently and resets visibility on cancel', () => {
  open();
  for (const [field, checkbox] of [
    ['Current password', 'Show current password'], ['New password', 'Show new password'],
    ['Confirm new password', 'Show password confirmation'],
  ]) {
    expect(screen.getByLabelText(field).getAttribute('type')).toBe('password');
    fireEvent.click(screen.getByLabelText(checkbox));
    expect(screen.getByLabelText(field).getAttribute('type')).toBe('text');
    fireEvent.click(screen.getByLabelText(checkbox));
    expect(screen.getByLabelText(field).getAttribute('type')).toBe('password');
  }
  fireEvent.click(screen.getByLabelText('Show new password'));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel password change' }));
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(screen.getByLabelText('New password').getAttribute('type')).toBe('password');
});
