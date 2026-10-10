import { useEffect, useRef, useState } from 'react';
import type { Cart } from '../types/cart';
import type { DeliveryDetails } from '../types/customer';
import { emptyDeliveryDetails, normalizeDeliveryDetails, validateDeliveryDetails, deliveryAddressText } from '../utils/customer';
import { fetchCustomerProfile } from '../services/customer';

interface Props {
  cart: Cart;
  busy: boolean;
  onSave: (value: DeliveryDetails) => Promise<Cart | null>;
  onCoupon: (code: string) => Promise<Cart | null>;
}
const addressFields = [
  ['addressLine1', 'House / building and street', 200, true],
  ['addressLine2', 'Area / landmark (optional)', 200, false],
  ['city', 'City', 80, true], ['state', 'State', 80, true], ['pincode', 'Pincode', 6, true],
] as const;
export default function CustomerFunnel({ cart, busy, onSave, onCoupon }: Props) {
  const [step, setStep] = useState<'cart' | 'contact' | 'address' | 'review'>(() => cart.deliveryDetails ? 'review' : 'cart');
  const [details, setDetails] = useState<DeliveryDetails>(() => cart.deliveryDetails ?? { ...emptyDeliveryDetails(), pincode: cart.deliveryPinCode ?? '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const hadSavedAddress = useRef(Boolean(cart.deliveryDetails));
  useEffect(() => {
    if (!cart.deliveryDetails && hadSavedAddress.current) {
      setDetails(current => ({ ...current, pincode: cart.deliveryPinCode ?? '' }));
      setStep('address');
      setError('Your delivery pincode changed. Please review and save the matching address.');
    }
    hadSavedAddress.current = Boolean(cart.deliveryDetails);
  }, [cart.deliveryDetails, cart.deliveryPinCode]);
  const set = (key: keyof DeliveryDetails, value: string) => setDetails(current => ({ ...current, [key]: value }));
  const reviewed = cart.deliveryDetails ?? details;
  const triedDefaultAddress = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (cart.deliveryDetails || triedDefaultAddress.current) return;
    triedDefaultAddress.current = true;
    void (async () => {
      const profile = await fetchCustomerProfile().catch(() => null);
      if (!mounted.current || !profile) return;
      // A signed-in customer's saved address is their default, unless the cart is already priced for another pincode.
      if (cart.deliveryPinCode && cart.deliveryPinCode !== profile.pincode) {
        setDetails(current => current.name ? current : { ...profile, pincode: cart.deliveryPinCode ?? profile.pincode });
        return;
      }
      const normalized = normalizeDeliveryDetails(profile);
      if (validateDeliveryDetails(normalized)) { setDetails(current => current.name ? current : profile); return; }
      const saved = await onSave(normalized).catch(() => null);
      if (!mounted.current || !saved?.deliveryDetails) return;
      setDetails(saved.deliveryDetails);
      setStep(current => current === 'cart' ? 'review' : current);
    })();
  }, [cart.deliveryDetails, cart.deliveryPinCode, onSave]);
  const startCheckout = async () => {
    if (cart.deliveryDetails) { setStep('review'); return; }
    if (!details.name) {
      const profile = await fetchCustomerProfile().catch(() => null);
      if (profile) setDetails(current => ({ ...profile, pincode: cart.deliveryPinCode ?? profile.pincode, email: profile.email || current.email }));
    }
    setStep('contact');
  };
  if (step === 'cart') return (
    <div className="space-y-2">
      <button type="button" disabled={busy} onClick={() => { void startCheckout(); }}
        className="w-full rounded-full bg-cocoa px-4 py-3 font-semibold text-white disabled:opacity-50">
        {cart.deliveryDetails ? 'Review delivery details' : 'Continue with delivery details'}
      </button>
      {!cart.deliveryDetails && <p className="text-center text-xs text-cocoa/65">
        Ordering as a guest? Guest orders do not receive the one-time welcome reward. Use Sign in at the top to use your account.
      </p>}
    </div>
  );
  return (
    <section className="space-y-3 rounded-2xl border border-mustard/40 bg-white p-4 text-sm text-cocoa" aria-label="Order details">
      <h3 className="font-heading text-lg font-bold">
        {step === 'contact' ? '1. Contact details' : step === 'address' ? '2. Delivery address' : '3. Review order request'}
      </h3>
      <p className="text-xs text-cocoa/65">Guest ordering available. Payment is not enabled; your order still needs confirmation.</p>
      {step !== 'review' && <form className="space-y-3" onSubmit={event => {
        event.preventDefault(); setError('');
        const normalized = normalizeDeliveryDetails(details);
        if (step === 'contact') {
          const contactError = validateDeliveryDetails({ ...normalized, addressLine1: 'Valid address', city: 'City', state: 'State', pincode: '110001' });
          if (contactError) { setError(contactError); return; }
          setDetails(normalized); setStep('address'); return;
        }
        const validation = validateDeliveryDetails(normalized);
        if (validation) { setError(validation); return; }
        setSaving(true);
        void onSave(normalized).then(saved => {
          if (!saved?.deliveryDetails) throw new Error('Delivery details were not saved. Please retry.');
          setDetails(saved.deliveryDetails); setStep('review');
        }).catch(error => setError(error instanceof Error ? error.message : 'Unable to save delivery details.'))
          .finally(() => setSaving(false));
      }}>
        {step === 'contact' ? <>
          <label className="block">Recipient name
            <input required maxLength={80} autoComplete="name" value={details.name} disabled={busy || saving}
              onChange={event => set('name', event.target.value)} className="mt-1 w-full rounded border p-2" />
          </label>
          <label className="block">Mobile number
            <input required inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} autoComplete="tel-national"
              value={details.phone} disabled={busy || saving} onChange={event => set('phone', event.target.value)}
              className="mt-1 w-full rounded border p-2" />
          </label>
          <label className="block">Contact email (optional)
            <input type="email" maxLength={254} autoComplete="email" value={details.email} disabled={busy || saving}
              onChange={event => set('email', event.target.value)} className="mt-1 w-full rounded border p-2" />
          </label>
        </> : <>
          {addressFields.map(([key, label, maxLength, required]) => <label key={key} className="block">{label}
            <input required={required} maxLength={maxLength} value={details[key]} disabled={busy || saving}
              inputMode={key === 'pincode' ? 'numeric' : 'text'}
              autoComplete={key === 'pincode' ? 'postal-code' : key === 'city' ? 'address-level2' : key === 'state' ? 'address-level1' : key === 'addressLine1' ? 'address-line1' : 'address-line2'}
              pattern={key === 'pincode' ? '[1-9][0-9]{5}' : undefined}
              onChange={event => set(key, event.target.value)} className="mt-1 w-full rounded border p-2" />
          </label>)}
          <p className="text-xs">Delivery country: India. These details are saved with your cart for up to 30 days and visible to Luvia for order fulfilment.</p>
        </>}
        <div className="flex gap-3">
          <button type="button" disabled={busy || saving} onClick={() => setStep(step === 'contact' ? 'cart' : 'contact')} className="underline">Back</button>
          <button disabled={busy || saving} className="rounded-full bg-cocoa px-4 py-2 text-white">
            {saving ? 'Saving…' : step === 'contact' ? 'Continue to address' : 'Save and review'}
          </button>
        </div>
      </form>}
      {step === 'review' && <>
        <p className="break-words">{reviewed.name} · +91 {reviewed.phone}</p>
        {reviewed.email && <p className="break-words">{reviewed.email}</p>}
        <p className="break-words">{deliveryAddressText(reviewed)}</p>
        {cart.welcomeCouponCode && <p className="break-words">Requested coupon: {cart.welcomeCouponCode} (subject to confirmation)</p>}
        <p className="text-xs">Review your cart items and estimated total, then send the order request using WhatsApp or email. The address is shopper-provided, not verified.</p>
        <button type="button" disabled={busy} onClick={() => { setDetails(reviewed); setStep('contact'); }} className="underline">Edit details</button>
        <form className="space-y-2" onSubmit={event => {
          event.preventDefault(); setSaving(true); setError('');
          void onCoupon(couponCode).catch(error => setError(error instanceof Error ? error.message : 'Unable to apply coupon.'))
            .finally(() => setSaving(false));
        }}>
          <label className="block">Coupon code
            <input required maxLength={64} value={couponCode} disabled={busy || saving}
              onChange={event => setCouponCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded border p-2" />
          </label>
          <button disabled={busy || saving} className="rounded-full border border-cocoa px-3 py-2">Apply coupon to request</button>
          {cart.welcomeCouponCode && <button type="button" disabled={busy || saving} className="ml-3 underline"
            onClick={() => {
              setSaving(true); setError('');
              void onCoupon('').catch(error => setError(error instanceof Error ? error.message : 'Unable to remove coupon.'))
                .finally(() => setSaving(false));
            }}>Remove coupon</button>}
        </form>
      </>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </section>
  );
}
