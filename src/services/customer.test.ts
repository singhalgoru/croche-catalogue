import { beforeEach, expect, it, vi } from 'vitest';
import { registerCustomerEmail, confirmCustomerEmail, sendCustomerPasswordReset, signInCustomerWithPassword, setCustomerPassword,
  validateCustomerPassword, fetchCustomerOrders, fetchAdminCustomerSummary, hideCancelledLiveOrder, updateOrderFulfilment } from './customer';
const { getUser, updateUser, verifyOtp, signInWithOtp, resetPasswordForEmail, signInWithPassword, signInAnonymously, getSession, from, rpc } = vi.hoisted(() => ({
  getUser: vi.fn(), updateUser: vi.fn(), verifyOtp: vi.fn(), signInWithOtp: vi.fn(), resetPasswordForEmail: vi.fn(), signInWithPassword: vi.fn(), signInAnonymously: vi.fn(), getSession: vi.fn(), from: vi.fn(), rpc: vi.fn(),
}));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({
  auth: { getUser, updateUser, verifyOtp, signInWithOtp, resetPasswordForEmail, signInWithPassword, signInAnonymously, getSession }, from, rpc,
}) }));
vi.mock('./cartCaptcha', () => ({ requestCartCaptcha: async () => 'fixture-captcha' }));
const details = { name: 'Buyer', phone: '9876543210', email: 'buyer@example.test', addressLine1: '12 Test Street',
  addressLine2: '', city: 'Delhi', state: 'Delhi', pincode: '110001' };
const password = 'Crochet2026';
it('saves fulfilment through the admin RPC and rejects failed or malformed results', async () => {
  const values = { status: 'shipped' as const, courierName: ' Courier ', trackingNumber: ' 123 ', trackingUrl: ' https://courier.example/123 ' };
  const saved = { ...values, updatedAt: '2026-10-10T15:00:00Z' };
  rpc.mockResolvedValue({ data: saved, error: null });
  await expect(updateOrderFulfilment('order', 'processing', values)).resolves.toEqual(saved);
  expect(rpc).toHaveBeenCalledWith('update_order_fulfilment', {
    target_order_id: 'order', expected_status: 'processing', new_status: 'shipped',
    courier: 'Courier', tracking: '123', tracking_link: 'https://courier.example/123',
  });
  rpc.mockResolvedValue({ error: { message: 'Admin access required.' } });
  await expect(updateOrderFulfilment('order', 'processing', values)).rejects.toThrow('Admin access required');
  rpc.mockResolvedValue({ data: {} });
  await expect(updateOrderFulfilment('order', 'processing', values)).rejects.toThrow('Invalid order status response');
});
it('hides cancelled orders through the admin RPC and reports rejected removals', async () => {
  await expect(hideCancelledLiveOrder('cancelled-order')).resolves.toBeUndefined();
  expect(rpc).toHaveBeenCalledWith('hide_cancelled_live_order', { target_order_id: 'cancelled-order' });
  rpc.mockResolvedValue({ error: { message: 'Only cancelled, unpaid online orders can be removed from the list.' } });
  await expect(hideCancelledLiveOrder('paid-order')).rejects.toThrow('Only cancelled, unpaid');
});
it('loads the admin-only registered customer summary and propagates denied access', async () => {
  const summary = { total: 0, verified: 0, pendingActivation: 0, welcomeEmailsSent: 0, customers: [] };
  rpc.mockResolvedValue({ data: summary, error: null });
  await expect(fetchAdminCustomerSummary()).resolves.toEqual(summary);
  expect(rpc).toHaveBeenCalledWith('get_admin_customer_summary', { page_offset: 0 });
  rpc.mockResolvedValue({ error: { message: 'Only catalogue admins can view registered customers.' } });
  await expect(fetchAdminCustomerSummary()).rejects.toThrow('Only catalogue admins');
});
it('fetches order history through the authenticated projection and reports errors', async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  await expect(fetchCustomerOrders(20)).resolves.toEqual([]);
  expect(rpc).toHaveBeenCalledWith('get_customer_orders', { page_offset: 20 });
  rpc.mockResolvedValue({ error: { message: 'Sign in required.' } });
  await expect(fetchCustomerOrders()).rejects.toThrow('Sign in required.');
  rpc.mockResolvedValue({ data: null, error: null });
  await expect(fetchCustomerOrders()).rejects.toThrow('invalid order history response');
});
beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'cart-owner', is_anonymous: true } }, error: null });
  updateUser.mockResolvedValue({ error: null });
  verifyOtp.mockResolvedValue({ error: null });
  signInWithOtp.mockResolvedValue({ error: null });
  resetPasswordForEmail.mockResolvedValue({ error: null });
  signInAnonymously.mockResolvedValue({ data: { user: { id: 'cart-owner', is_anonymous: true } }, error: null });
  getSession.mockResolvedValue({ data: { session: { user: { id: 'cart-owner' } } }, error: null });
  rpc.mockResolvedValue({ error: null });
});
it('upgrades the existing anonymous identity instead of creating a different cart owner', async () => {
  await registerCustomerEmail({ ...details, email: ' BUYER@EXAMPLE.TEST ' }, password);
  expect(signInAnonymously).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith('stage_customer_signup', { signup_details: details });
  expect(updateUser).toHaveBeenCalledWith({ email: 'buyer@example.test', password }, { emailRedirectTo: expect.any(String) });
  expect(signInWithOtp).not.toHaveBeenCalled();
});
it('never modifies an already registered or admin account email', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'member', is_anonymous: false } }, error: null });
  await expect(registerCustomerEmail(details, password)).rejects.toThrow('already linked');
  expect(updateUser).not.toHaveBeenCalled();
});
it('creates an anonymous signup session before attaching the email when none exists', async () => {
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  getUser.mockImplementation(async () => signInAnonymously.mock.calls.length
    ? { data: { user: { id: 'cart-owner', is_anonymous: true } }, error: null }
    : { data: { user: null }, error: { message: 'Auth session missing!' } });
  await registerCustomerEmail(details, password);
  expect(signInAnonymously).toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith('stage_customer_signup', { signup_details: details });
  expect(updateUser).toHaveBeenCalledWith({ email: 'buyer@example.test', password }, { emailRedirectTo: expect.any(String) });
});
it('verifies email-change codes and reports failed verification', async () => {
  await confirmCustomerEmail('BUYER@EXAMPLE.TEST', ' 123456 ');
  expect(verifyOtp).toHaveBeenCalledWith({ email: 'buyer@example.test', token: '123456', type: 'email_change' });
  verifyOtp.mockResolvedValue({ error: { message: 'Expired code' } });
  await expect(confirmCustomerEmail('buyer@example.test', '123456')).rejects.toThrow('Expired code');
});

it('does not send email if staging signup details fails', async () => {
  rpc.mockResolvedValue({ error: { message: 'Invalid signup' } });
  await expect(registerCustomerEmail(details, password)).rejects.toThrow('Invalid signup');
  expect(updateUser).not.toHaveBeenCalled();
});

it('validates full details before preparing a session', async () => {
  await expect(registerCustomerEmail({ ...details, phone: '' }, password)).rejects.toThrow('mobile');
  expect(signInAnonymously).not.toHaveBeenCalled();
});
it('sends a password reset email with CAPTCHA back to the store', async () => {
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  await sendCustomerPasswordReset(' BUYER@EXAMPLE.TEST ');
  expect(resetPasswordForEmail).toHaveBeenCalledWith('buyer@example.test',
    { redirectTo: expect.stringMatching(/\/$/), captchaToken: 'fixture-captcha' });
  await expect(sendCustomerPasswordReset('  ')).rejects.toThrow('Enter your account email');
  resetPasswordForEmail.mockResolvedValue({ error: { message: 'Rate limited' } });
  await expect(sendCustomerPasswordReset('buyer@example.test')).rejects.toThrow('Rate limited');
});
it('prevents resetting into a different account while an active cart has items', async () => {
  getSession.mockResolvedValue({ data: { session: { user: { id: 'owner' } } }, error: null });
  const query = { select: () => query, eq: () => query, gt: async () => ({ data: [{ cart_items: [{ id: 'item' }] }], error: null }) };
  from.mockReturnValue(query);
  await expect(sendCustomerPasswordReset('buyer@example.test')).rejects.toThrow('current cart has items');
  expect(resetPasswordForEmail).not.toHaveBeenCalled();
});it('rejects weak or mismatched passwords before preparing a signup session', async () => {
  expect(validateCustomerPassword('short1')).toContain('at least 8');
  expect(validateCustomerPassword('allletters')).toContain('letter and one number');
  expect(validateCustomerPassword(password, 'Different1')).toBe('Passwords do not match.');
  expect(validateCustomerPassword(password, password)).toBeNull();
  await expect(registerCustomerEmail(details, 'weak')).rejects.toThrow('at least 8');
  expect(signInAnonymously).not.toHaveBeenCalled();
  expect(updateUser).not.toHaveBeenCalled();
});
it('signs in with a password using CAPTCHA and friendly errors', async () => {
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  signInWithPassword.mockResolvedValue({ error: null });
  await signInCustomerWithPassword(' BUYER@EXAMPLE.TEST ', password);
  expect(signInWithPassword).toHaveBeenCalledWith({ email: 'buyer@example.test', password, options: { captchaToken: 'fixture-captcha' } });
  signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
  await expect(signInCustomerWithPassword('buyer@example.test', 'wrong')).rejects.toThrow('Use Forgot password');
  signInWithPassword.mockResolvedValue({ error: { message: 'Email not confirmed' } });
  await expect(signInCustomerWithPassword('buyer@example.test', password)).rejects.toThrow('Activate your account');
});
it('blocks password sign-in into another account while the current cart has items', async () => {
  const query = { select: () => query, eq: () => query, gt: async () => ({ data: [{ cart_items: [{ id: 'item' }] }], error: null }) };
  from.mockReturnValue(query);
  await expect(signInCustomerWithPassword('buyer@example.test', password)).rejects.toThrow('current cart has items');
  expect(signInWithPassword).not.toHaveBeenCalled();
});
it('sets a password for a signed-in customer', async () => {
  await setCustomerPassword(password, password);
  expect(updateUser).toHaveBeenCalledWith({ password });
  await expect(setCustomerPassword(password, 'Mismatch1')).rejects.toThrow('do not match');
});
