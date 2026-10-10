import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CustomerAccount from './CustomerAccount';
import { fetchCustomerAccount, registerCustomerEmail, confirmCustomerEmail, sendCustomerSignIn, fetchWelcomeOffer, fetchCustomerProfile,
  signInCustomerWithPassword, setCustomerPassword, validateCustomerPassword } from '../services/customer';

vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => null }));
vi.mock('../services/customer', () => ({
  fetchCustomerAccount: vi.fn(), registerCustomerEmail: vi.fn(), confirmCustomerEmail: vi.fn(),
  sendCustomerSignIn: vi.fn(), fetchWelcomeOffer: vi.fn(), emailWelcomeCoupon: vi.fn(),
  signOutCustomer: vi.fn(), fetchCustomerProfile: vi.fn(), signInCustomerWithPassword: vi.fn(), setCustomerPassword: vi.fn(),
  validateCustomerPassword: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchCustomerAccount).mockResolvedValue(null);
  vi.mocked(sendCustomerSignIn).mockResolvedValue(undefined);
  vi.mocked(registerCustomerEmail).mockResolvedValue(undefined);
  vi.mocked(confirmCustomerEmail).mockResolvedValue(undefined);
  vi.mocked(fetchWelcomeOffer).mockResolvedValue({ enabled: false, percent: 10, maxDiscountRupees: 100, minimumSubtotalRupees: 500, validDays: 30 });
  vi.mocked(fetchCustomerProfile).mockResolvedValue(null);
  vi.mocked(validateCustomerPassword).mockImplementation((value, confirmation = value) => value === confirmation ? null : 'Passwords do not match.');
  vi.mocked(signInCustomerWithPassword).mockResolvedValue(undefined);
  vi.mocked(setCustomerPassword).mockResolvedValue(undefined);
});
afterEach(cleanup);

it('can email a sign-in link when the customer has no password, with visible confirmation', async () => {
  render(<CustomerAccount canSignUp={false} />);
  expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Account email'), { target: { value: 'buyer@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password? Email me a sign-in link' }));
  expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Sign-in link requested'));
  expect(sendCustomerSignIn).toHaveBeenCalledWith('buyer@example.test');
});

it('makes selecting sign-in visibly change the form and focus the email', () => {
  render(<CustomerAccount canSignUp />);
  const signIn = within(screen.getByLabelText('Account options')).getByRole('button', { name: 'Sign in' });
  fireEvent.click(signIn);
  expect(signIn.getAttribute('aria-pressed')).toBe('true');
  expect(document.activeElement).toBe(screen.getByLabelText('Account email'));
  expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password');
  expect(screen.queryByLabelText('Confirm password')).toBeNull();
});

it('shows email-provider failures explicitly', async () => {
  vi.mocked(sendCustomerSignIn).mockRejectedValue(new Error('Email provider is unavailable.'));
  render(<CustomerAccount canSignUp={false} />);
  fireEvent.change(screen.getByLabelText('Account email'), { target: { value: 'buyer@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password? Email me a sign-in link' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Email provider is unavailable.');
  expect(screen.queryByRole('status')).toBeNull();
});

it('does not claim verification succeeded when the account is still unverified', async () => {
  render(<CustomerAccount canSignUp initialEmail="buyer@example.test" initialDetails={{
    name: 'Buyer', phone: '9876543210', email: 'buyer@example.test', addressLine1: '12 Test Street',
    addressLine2: '', city: 'Delhi', state: 'Delhi', pincode: '110001',
  }} />);
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Crochet2026' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Crochet2026' } });
  fireEvent.click(within(screen.getByRole('form', { name: 'Customer signup' })).getByRole('button', { name: 'Create account' }));
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

const signupDetails = { name: 'Buyer', phone: '9876543210', email: 'buyer@example.test', addressLine1: '12 Test Street',
  addressLine2: '', city: 'Delhi', state: 'Delhi', pincode: '110001' };
it('sends the chosen password with signup and blocks mismatched confirmation', async () => {
  render(<CustomerAccount canSignUp initialEmail="buyer@example.test" initialDetails={signupDetails} />);
  const form = screen.getByRole('form', { name: 'Customer signup' });
  expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('new-password');
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Crochet2026' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Crochet2027' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Create account' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Passwords do not match.');
  expect(registerCustomerEmail).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Crochet2026' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Create account' }));
  expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('activation link'));
  expect(registerCustomerEmail).toHaveBeenCalledWith(signupDetails, 'Crochet2026');
});
it('signs in with email and password', async () => {
  render(<CustomerAccount canSignUp initialMode="signin" />);
  fireEvent.change(screen.getByLabelText('Account email'), { target: { value: 'buyer@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Crochet2026' } });
  fireEvent.click(within(screen.getByRole('form', { name: 'Customer sign in' })).getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Signed in'));
  expect(signInCustomerWithPassword).toHaveBeenCalledWith('buyer@example.test', 'Crochet2026');
  expect(sendCustomerSignIn).not.toHaveBeenCalled();
});
it('lets signed-in customers set a password and continue checkout with their saved profile', async () => {
  vi.mocked(fetchCustomerAccount).mockResolvedValue('buyer@example.test');
  vi.mocked(fetchCustomerProfile).mockResolvedValue(signupDetails);
  const onContinue = vi.fn();
  render(<CustomerAccount canSignUp onContinue={onContinue} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Set or change password' }));
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Crochet2026' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Crochet2026' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }));
  expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Password saved'));
  expect(setCustomerPassword).toHaveBeenCalledWith('Crochet2026', 'Crochet2026');
  fireEvent.click(screen.getByRole('button', { name: 'Continue to delivery details' }));
  expect(onContinue).toHaveBeenCalledWith(signupDetails);
});
it('offers guest checkout and states that guests lose the welcome reward', async () => {
  vi.mocked(fetchWelcomeOffer).mockResolvedValue({ enabled: true, percent: 10, maxDiscountRupees: 100, minimumSubtotalRupees: 500, validDays: 30 });
  const onGuest = vi.fn();
  render(<CustomerAccount canSignUp onGuest={onGuest} />);
  expect(await screen.findByText(/Guest orders do not receive the one-time welcome reward \(10% off/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continue as guest' }));
  expect(onGuest).toHaveBeenCalled();
});