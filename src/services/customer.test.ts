import { beforeEach, expect, it, vi } from 'vitest';
import { registerCustomerEmail, confirmCustomerEmail, sendCustomerSignIn } from './customer';
const { getUser, updateUser, verifyOtp, signInWithOtp, signInAnonymously, getSession, from } = vi.hoisted(() => ({
  getUser: vi.fn(), updateUser: vi.fn(), verifyOtp: vi.fn(), signInWithOtp: vi.fn(), signInAnonymously: vi.fn(), getSession: vi.fn(), from: vi.fn(),
}));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({
  auth: { getUser, updateUser, verifyOtp, signInWithOtp, signInAnonymously, getSession }, from,
}) }));
vi.mock('./cartCaptcha', () => ({ requestCartCaptcha: async () => 'fixture-captcha' }));
beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'cart-owner', is_anonymous: true } }, error: null });
  updateUser.mockResolvedValue({ error: null });
  verifyOtp.mockResolvedValue({ error: null });
  signInWithOtp.mockResolvedValue({ error: null });
  signInAnonymously.mockResolvedValue({ data: { user: { id: 'cart-owner', is_anonymous: true } }, error: null });
  getSession.mockResolvedValue({ data: { session: null }, error: null });
});
it('upgrades the existing anonymous identity instead of creating a different cart owner', async () => {
  await registerCustomerEmail(' BUYER@EXAMPLE.TEST ');
  expect(updateUser).toHaveBeenCalledWith({ email: 'buyer@example.test' }, { emailRedirectTo: expect.any(String) });
  expect(signInWithOtp).not.toHaveBeenCalled();
});
it('never modifies an already registered or admin account email', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'member', is_anonymous: false } }, error: null });
  await expect(registerCustomerEmail('new@example.test')).rejects.toThrow('already linked');
  expect(updateUser).not.toHaveBeenCalled();
});
it('creates an anonymous signup session before attaching the email when none exists', async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: null });
  await registerCustomerEmail('buyer@example.test');
  expect(signInAnonymously).toHaveBeenCalled();
  expect(updateUser).toHaveBeenCalledWith({ email: 'buyer@example.test' }, { emailRedirectTo: expect.any(String) });
});
it('verifies email-change codes and reports failed verification', async () => {
  await confirmCustomerEmail('BUYER@EXAMPLE.TEST', ' 123456 ');
  expect(verifyOtp).toHaveBeenCalledWith({ email: 'buyer@example.test', token: '123456', type: 'email_change' });
  verifyOtp.mockResolvedValue({ error: { message: 'Expired code' } });
  await expect(confirmCustomerEmail('buyer@example.test', '123456')).rejects.toThrow('Expired code');
});
it('uses CAPTCHA and does not create accounts on returning-customer login', async () => {
  await sendCustomerSignIn('buyer@example.test');
  expect(signInWithOtp).toHaveBeenCalledWith({ email: 'buyer@example.test', options: {
    shouldCreateUser: false, emailRedirectTo: expect.any(String), captchaToken: 'fixture-captcha',
  } });
});
it('prevents signing into a different account while an active cart has items', async () => {
  getSession.mockResolvedValue({ data: { session: { user: { id: 'owner' } } }, error: null });
  const query = { select: () => query, eq: () => query, gt: async () => ({ data: [{ cart_items: [{ id: 'item' }] }], error: null }) };
  from.mockReturnValue(query);
  await expect(sendCustomerSignIn('buyer@example.test')).rejects.toThrow('current cart has items');
  expect(signInWithOtp).not.toHaveBeenCalled();
});
it('explains when a requested sign-in email does not yet have an account', async () => {
  signInWithOtp.mockResolvedValue({ error: { message: 'Signups not allowed for otp' } });
  await expect(sendCustomerSignIn('buyer@example.test')).rejects.toThrow('Create account first');
});
