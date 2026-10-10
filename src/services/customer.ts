import { loadSupabase } from '../lib/supabaseConfig';
import type { CampaignCoupon, WelcomeCoupon, WelcomeOffer } from '../types/customer';
import { requestCartCaptcha } from './cartCaptcha';

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
export async function registerCustomerEmail(email: string) {
  const supabase = await client();
  const { data: current, error: currentError } = await supabase.auth.getUser();
  if (currentError) throw new Error(currentError.message);
  if (!current.user) {
    const captchaToken = await requestCartCaptcha();
    const { error: anonymousError } = await supabase.auth.signInAnonymously(
      captchaToken ? { options: { captchaToken } } : undefined,
    );
    if (anonymousError) {
      throw new Error(`Unable to prepare your signup session: ${anonymousError.message}`);
    }
  } else if (!current.user.is_anonymous) {
    throw new Error('Your cart is already linked to an account. Do not change its email here.');
  }
  const { error } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() },
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
export async function sendCustomerSignIn(email: string) {
  const supabase = await client();
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
  const captchaToken = await requestCartCaptcha();
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/`, ...(captchaToken ? { captchaToken } : {}) } });
  if (error) {
    if (error.message.toLowerCase().includes('signups not allowed for otp')) {
      throw new Error('No saved account found for that email. Choose Create account first, then use the verification link.');
    }
    throw new Error(`Unable to send your sign-in link: ${error.message}`);
  }
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
