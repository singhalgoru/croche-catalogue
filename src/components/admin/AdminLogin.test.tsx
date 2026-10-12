import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdminLogin from './AdminLogin';
import { sendCustomerPasswordReset } from '../../services/customer';
const { signIn, captcha } = vi.hoisted(() => ({ signIn: vi.fn(), captcha: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signInWithPassword: signIn } } }));
vi.mock('../../services/cartCaptcha', () => ({ requestCartCaptcha: captcha }));
vi.mock('../../services/customer', () => ({ sendCustomerPasswordReset: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  signIn.mockResolvedValue({ error: null }); captcha.mockResolvedValue('captcha');
  vi.mocked(sendCustomerPasswordReset).mockResolvedValue(undefined);
});
afterEach(cleanup);
it('requests an admin reset with only email and clears the previous password', async () => {
  render(<AdminLogin />);
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'old-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  const form = screen.getByRole('form', { name: 'Admin forgot password' });
  expect(form.querySelectorAll('input')).toHaveLength(1);
  expect(screen.queryByLabelText('Password')).toBeNull();
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.test' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Send reset link' }));
  expect((await screen.findByRole('status')).textContent).toContain('If an account exists');
  expect(sendCustomerPasswordReset).toHaveBeenCalledWith('admin@example.test');
  expect(signIn).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
  expect(screen.getByLabelText('Password')).toHaveProperty('value', '');
});
it('shows reset errors without exposing whether the account exists', async () => {
  vi.mocked(sendCustomerPasswordReset).mockRejectedValue(new Error('Email service unavailable.'));
  render(<AdminLogin />);
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.test' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Admin forgot password' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Email service unavailable.');
  expect(screen.queryByRole('status')).toBeNull();
});
