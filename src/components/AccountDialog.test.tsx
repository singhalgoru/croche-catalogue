import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AccountDialog from './AccountDialog';
import { setCustomerPassword } from '../services/customer';

vi.mock('./CustomerAccount', () => ({
  default: ({ initialMode, onModeChange }: { initialMode?: string; onModeChange?: (mode: 'signup' | 'signin') => void }) => <>
    <p>Account form: {initialMode}</p>
    <button type="button" onClick={() => onModeChange?.('signin')}>Switch to sign in</button>
    <button type="button" onClick={() => onModeChange?.('signup')}>Switch to create account</button>
  </>,
}));
vi.mock('../services/customer', () => ({ setCustomerPassword: vi.fn() }));
afterEach(cleanup);

it('opens the requested account mode as an accessible dialog and closes with Escape', () => {
  const onClose = vi.fn();
  render(<AccountDialog mode="signup" onClose={onClose} />);
  expect(screen.getByRole('dialog', { name: 'Create your Luvia account' })).toBeTruthy();
  expect(screen.getByText('Account form: signup')).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close account' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});

it('keeps the title in sync with the selected account tab', () => {
  render(<AccountDialog mode="signin" onClose={vi.fn()} />);
  expect(screen.getByRole('dialog', { name: 'Sign in to Luvia' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Switch to create account' }));
  expect(screen.getByRole('dialog', { name: 'Create your Luvia account' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Switch to sign in' }));
  expect(screen.getByRole('dialog', { name: 'Sign in to Luvia' })).toBeTruthy();
});

it('lets a customer from a reset link save a new password', async () => {
  vi.mocked(setCustomerPassword).mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(<AccountDialog mode="reset" onClose={onClose} />);
  expect(screen.getByRole('dialog', { name: 'Set a new password' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Crochet2030' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Crochet2030' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('password has been updated'));
  expect(setCustomerPassword).toHaveBeenCalledWith('Crochet2030', 'Crochet2030');
  fireEvent.click(screen.getByRole('button', { name: 'Continue shopping' }));
  expect(onClose).toHaveBeenCalled();
});

it('explains an expired reset link', async () => {
  vi.mocked(setCustomerPassword).mockRejectedValue(new Error('Unable to save your password: Auth session missing!'));
  render(<AccountDialog mode="reset" onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Crochet2030' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Crochet2030' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
  expect((await screen.findByRole('alert')).textContent).toContain('reset link has expired');
});