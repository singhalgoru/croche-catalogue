import { loadSupabase } from '../lib/supabaseConfig';
import type { CampaignCoupon, DeliveryDetails, WelcomeCoupon, WelcomeOffer } from '../types/customer';
import { requestCartCaptcha } from './cartCaptcha';
import { normalizeDeliveryDetails, validateDeliveryDetails } from '../utils/customer';

async function client() {
  const value = await loadSupabase();
  if (!value) throw new Error('Customer accounts require an online connection.');
  return value;
}
export async function fetchCustomerAccount() {
  const supabase = await client();
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Unable to restore account: ${sessionError.message}`);
  if (!session.session) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(`Unable to restore your account: ${error.message}`);
  return data.user && !data.user.is_anonymous && data.user.email_confirmed_at ? data.user.email ?? null : null;
}
export async function fetchCustomerProfile(): Promise<DeliveryDetails | null> {
  const supabase = await client();
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Unable to restore profile: ${sessionError.message}`);
  if (!session.session) return null;
  const { data, error } = await supabase.from('customer_profiles').select('details')
    .eq('user_id', session.session.user.id).maybeSingle();
  if (error) throw new Error(`Unable to load your saved details: ${error.message}`);
  return data?.details ?? null;
}
export const PASSWORD_MIN_LENGTH = 8;
export function validateCustomerPassword(password: string, confirmation = password) {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use a password of at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > 72) return 'Use a password of at most 72 characters.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Use at least one letter and one number in your password.';
  if (password !== confirmation) return 'Passwords do not match.';
  return null;
}
export async function registerCustomerEmail(details: DeliveryDetails, password: string) {
  const cleaned = normalizeDeliveryDetails(details);
  const validation = validateDeliveryDetails(cleaned) ?? validateCustomerPassword(password);
  if (validation || !cleaned.email) throw new Error(validation ?? 'Enter your account email.');
  const supabase = await client();
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Unable to restore your signup session: ${sessionError.message}`);
  if (!session.session) {
    const captchaToken = await requestCartCaptcha();
    const { data, error: anonymousError } = await supabase.auth.signInAnonymously(
      captchaToken ? { options: { captchaToken } } : undefined,
    );
    if (anonymousError || !data.user) {
      throw new Error(`Unable to prepare your signup session: ${anonymousError?.message ?? 'No signup session returned.'}`);
    }
  }
  const { data: current, error: currentError } = await supabase.auth.getUser();
  if (currentError) throw new Error(`Unable to check your signup session: ${currentError.message}`);
  if (!current.user?.is_anonymous) {
    throw new Error('Your cart is already linked to an account. Do not change its email here.');
  }
  const { error: saveError } = await supabase.rpc('stage_customer_signup', { signup_details: cleaned });
  if (saveError) throw new Error(`Unable to prepare your customer details: ${saveError.message}`);
  // Supabase accepts a password for an anonymous user only together with the email it is upgrading to;
  // the password works for sign-in once that email is verified.
  const { error } = await supabase.auth.updateUser({ email: cleaned.email, password },
    { emailRedirectTo: `${window.location.origin}/` });
  if (error) throw new Error(`Unable to send your signup email: ${error.message}`);
}
export async function confirmCustomerEmail(email: string, token: string) {
  const supabase = await client();
  const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: 'email_change' });
  if (error) throw new Error(`Unable to verify email: ${error.message}`);
}
export async function signOutCustomer() {
  const supabase = await client();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Unable to sign out: ${error.message}`);
}
type SupabaseClient = NonNullable<Awaited<ReturnType<typeof loadSupabase>>>;
async function assertNoActiveCartItems(supabase: SupabaseClient) {
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (data.session) {
    const { data: carts, error } = await supabase.from('carts').select('id,cart_items(id)')
      .eq('user_id', data.session.user.id).gt('expires_at', new Date().toISOString());
    if (error) throw new Error(`Unable to check your current cart: ${error.message}`);
    if (carts?.some(cart => cart.cart_items?.length)) {
      throw new Error('Your current cart has items. Send its order request or clear it before signing into a different account.');
    }
  }
}
export async function signInCustomerWithPassword(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) throw new Error('Enter your email and password.');
  const supabase = await client();
  await assertNoActiveCartItems(supabase);
  const captchaToken = await requestCartCaptcha();
  const { error } = await supabase.auth.signInWithPassword({ email: normalized, password,
    ...(captchaToken ? { options: { captchaToken } } : {}) });
  if (error) {
    const text = error.message.toLowerCase();
    if (text.includes('invalid login credentials')) {
      throw new Error('Email or password is incorrect. Use Forgot password to set a new one.');
    }
    if (text.includes('email not confirmed')) throw new Error('Activate your account from the email we sent before signing in.');
    throw new Error(`Unable to sign in: ${error.message}`);
  }
}
export async function setCustomerPassword(password: string, confirmation: string) {
  const validation = validateCustomerPassword(password, confirmation);
  if (validation) throw new Error(validation);
  const supabase = await client();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(`Unable to save your password: ${error.message}`);
}
export async function sendCustomerPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error('Enter your account email first, then choose Forgot password.');
  const supabase = await client();
  await assertNoActiveCartItems(supabase);
  const captchaToken = await requestCartCaptcha();
  const { error } = await supabase.auth.resetPasswordForEmail(normalized,
    { redirectTo: `${window.location.origin}/`, ...(captchaToken ? { captchaToken } : {}) });
  if (error) throw new Error(`Unable to send your password reset email: ${error.message}`);
}
export async function fetchWelcomeOffer(): Promise<WelcomeOffer> {
  const supabase = await client();
  const { data, error } = await supabase.from('welcome_offer').select('*').eq('id', true).single();
  if (error) throw new Error(`Unable to load welcome offer: ${error.message}`);
  return { enabled: data.enabled, percent: data.percent, maxDiscountRupees: data.max_discount_rupees,
    minimumSubtotalRupees: data.minimum_subtotal_rupees, validDays: data.valid_days };
}
export async function saveWelcomeOffer(value: WelcomeOffer) {
  const supabase = await client();
  const { data, error } = await supabase.from('welcome_offer').update({
    enabled: value.enabled, percent: value.percent, max_discount_rupees: value.maxDiscountRupees,
    minimum_subtotal_rupees: value.minimumSubtotalRupees, valid_days: value.validDays,
  }).eq('id', true).select('id').single();
  if (error || !data) throw new Error(`Unable to save welcome offer: ${error?.message ?? 'No settings updated.'}`);
}
export async function emailWelcomeCoupon(): Promise<WelcomeCoupon> {
  const supabase = await client();
  const { data, error } = await supabase.functions.invoke('welcome-coupon', { body: {} });
  if (error) {
    if (error.context instanceof Response) {
      const payload = await error.context.json();
      if (typeof payload?.error === 'string') throw new Error(payload.error);
    }

    throw new Error(`Unable to email your coupon: ${error.message}`);
  }
  const coupon = data?.coupon;
  if (!coupon || typeof coupon.code !== 'string' || typeof coupon.expires_at !== 'string'
    || typeof coupon.percent !== 'number' || typeof coupon.max_discount_rupees !== 'number'
    || typeof coupon.minimum_subtotal_rupees !== 'number' || typeof coupon.email_sent_at !== 'string') {
    throw new Error('The coupon service returned an invalid email confirmation.');
  }
  return coupon;
}

export async function fetchCampaignCoupons(): Promise<CampaignCoupon[]> {
  const supabase = await client();
  const { data, error } = await supabase.from('campaign_coupons').select('*')
    .order('created_at', { ascending: false }).limit(50);
  if (error || !data) throw new Error(`Unable to load coupons: ${error?.message ?? 'No response returned.'}`);
  return data;
}
export async function generateCampaignCoupon(input: {
  percent: number; cap: number; minimum: number; expiresAt: string; maxUses: number; firstOrder: boolean;
}): Promise<CampaignCoupon> {
  const supabase = await client();
  const { data, error } = await supabase.rpc('generate_campaign_coupon', {
    discount_percent: input.percent, discount_cap: input.cap, minimum_subtotal: input.minimum,
    expiry: input.expiresAt, usage_limit: input.maxUses, first_order: input.firstOrder,
  });
  if (error || !data?.code) throw new Error(`Unable to generate coupon: ${error?.message ?? 'No coupon returned.'}`);
  return data;
}
export async function setCampaignCouponEnabled(id: string, enabled: boolean) {
  const supabase = await client();
  const { data, error } = await supabase.from('campaign_coupons').update({ enabled }).eq('id', id).select('id').single();
  if (error || !data) throw new Error(`Unable to update coupon: ${error?.message ?? 'No coupon updated.'}`);
}
export async function deleteCampaignCoupon(id: string) {
  const supabase = await client();
  const { error } = await supabase.rpc('delete_campaign_coupon', { coupon_id: id });
  if (error) throw new Error(`Unable to delete coupon: ${error.message}`);
}
