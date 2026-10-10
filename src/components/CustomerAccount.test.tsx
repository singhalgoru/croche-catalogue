import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CustomerAccount from './CustomerAccount';
import { fetchCustomerAccount, registerCustomerEmail, confirmCustomerEmail, sendCustomerSignIn, fetchWelcomeOffer, fetchCustomerProfile } from '../services/customer';

vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => null }));
vi.mock('../services/customer', () => ({
  fetchCustomerAccount: vi.fn(), registerCustomerEmail: vi.fn(), confirmCustomerEmail: vi.fn(),
  sendCustomerSignIn: vi.fn(), fetchWelcomeOffer: vi.fn(), emailWelcomeCoupon: vi.fn(),
  signOutCustomer: vi.fn(), fetchCustomerProfile: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchCustomerAccount).mockResolvedValue(null);
  vi.mocked(sendCustomerSignIn).mockResolvedValue(undefined);
  vi.mocked(registerCustomerEmail).mockResolvedValue(undefined);
  vi.mocked(confirmCustomerEmail).mockResolvedValue(undefined);
  vi.mocked(fetchWelcomeOffer).mockResolvedValue({ enabled: false, percent: 10, maxDiscountRupees: 100, minimumSubtotalRupees: 500, validDays: 30 });
  vi.mocked(fetchCustomerProfile).mockResolvedValue(null);
});
afterEach(cleanup);

it('has one actionable sign-in control on an empty cart, with visible confirmation', async () => {
  render(<CustomerAccount canSignUp={false} />);
  expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Account email'), { target: { value: 'buyer@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));
  expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Sign-in link requested'));
  expect(sendCustomerSignIn).toHaveBeenCalledWith('buyer@example.test');
});

it('makes selecting sign-in visibly change the form and focus the email', () => {
  render(<CustomerAccount canSignUp />);
  const signIn = screen.getByRole('button', { name: 'Sign in' });
  fireEvent.click(signIn);
  expect(signIn.getAttribute('aria-pressed')).toBe('true');
  expect(document.activeElement).toBe(screen.getByLabelText('Account email'));
  expect(screen.getByRole('button', { name: 'Send sign-in link' })).toBeTruthy();
});

it('shows email-provider failures explicitly', async () => {
  vi.mocked(sendCustomerSignIn).mockRejectedValue(new Error('Email provider is unavailable.'));
  render(<CustomerAccount canSignUp={false} />);
  fireEvent.change(screen.getByLabelText('Account email'), { target: { value: 'buyer@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Email provider is unavailable.');
  expect(screen.queryByRole('status')).toBeNull();
});

it('does not claim verification succeeded when the account is still unverified', async () => {
  render(<CustomerAccount canSignUp initialEmail="buyer@example.test" initialDetails={{
    name: 'Buyer', phone: '9876543210', email: 'buyer@example.test', addressLine1: '12 Test Street',
    addressLine2: '', city: 'Delhi', state: 'Delhi', pincode: '110001',
  }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Send signup email' }));
  await screen.findByLabelText('Email verification code');
  fireEvent.change(screen.getByLabelText('Email verification code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('not complete'));
  expect(screen.queryByText(/Your email is verified/)).toBeNull();
});

it('motivates signup with the enabled reward and its real terms', async () => {
  vi.mocked(fetchWelcomeOffer).mockResolvedValue({ enabled: true, percent: 10, maxDiscountRupees: 100, minimumSubtotalRupees: 500, validDays: 30 });
  render(<CustomerAccount canSignUp />);
  expect(await screen.findByText('Join Luvia and unlock a one-time welcome reward')).toBeTruthy();
  expect(screen.getByText(/10% off your first order, up to ₹100, with a minimum items subtotal of ₹500/)).toBeTruthy();
});

it('does not promise a signup reward when the offer is disabled', async () => {
  render(<CustomerAccount canSignUp />);
  await screen.findByText('Optional email account');
  expect(screen.queryByText('Join Luvia and unlock a one-time welcome reward')).toBeNull();
});
