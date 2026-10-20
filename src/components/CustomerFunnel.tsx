import { useEffect, useRef, useState } from 'react';
import type { Cart } from '../types/cart';
import { formatINR } from '../utils/currency';
import { getCartTotals } from '../utils/cartMessage';
import type { DeliveryDetails, SavedAddress } from '../types/customer';
import { emptyDeliveryDetails, normalizeDeliveryDetails, validateDeliveryDetails, deliveryAddressText } from '../utils/customer';
import { fetchCustomerAddresses, fetchCustomerProfile } from '../services/customer';
import { trackCartStep } from '../services/analytics';
import { formatDeliveryDays, formatEstimatedDeliveryDateRange, getCurrentDeliveryEstimate } from '../utils/deliveryEstimate';

const sameAddress = (a: DeliveryDetails, b: DeliveryDetails) =>
  (['name', 'phone', 'addressLine1', 'addressLine2', 'city', 'state', 'pincode'] as const).every(key => a[key] === b[key]);

interface Props {
  cart: Cart;
  busy: boolean;
  onSave: (value: DeliveryDetails) => Promise<Cart | null>;
  onCoupon: (code: string) => Promise<Cart | null>;
  onlineCheckout?: boolean;
  pageStep?: 'delivery' | 'review';
  onReview?: () => void;
  onEdit?: () => void;
  onBack?: () => void;
}
const addressFields = [
  ['addressLine1', 'House / building and street', 200, true],
  ['addressLine2', 'Area / landmark (optional)', 200, false],
  ['city', 'City', 80, true], ['state', 'State', 80, true], ['pincode', 'Pincode', 6, true],
] as const;
export default function CustomerFunnel({ cart, busy, onSave, onCoupon, onlineCheckout = false, pageStep, onReview, onEdit, onBack }: Props) {
  const totals = getCartTotals(cart);
  const [step, setStep] = useState<'cart' | 'contact' | 'address' | 'review'>(() =>
    pageStep === 'delivery' ? 'contact' : cart.deliveryDetails ? 'review' : pageStep ? 'contact' : 'cart');
  const [details, setDetails] = useState<DeliveryDetails>(() => cart.deliveryDetails ?? { ...emptyDeliveryDetails(), pincode: cart.deliveryPinCode ?? '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  useEffect(() => {
    let current = true;
    void fetchCustomerAddresses().then(next => { if (current) setSavedAddresses(next); })
      .catch(failure => { if (current) setError(failure instanceof Error ? failure.message : 'Unable to load saved addresses. Please enter your address or retry.'); });
    return () => { current = false; };
  }, []);
  const hadSavedAddress = useRef(Boolean(cart.deliveryDetails));
  const addressEdited = useRef(false);
  useEffect(() => {
    if (!cart.deliveryDetails && hadSavedAddress.current) {
      setDetails(current => ({ ...current, pincode: cart.deliveryPinCode ?? '' }));
      setStep('address');
      setError('Your delivery pincode changed. Please review and save the matching address.');
    }
    hadSavedAddress.current = Boolean(cart.deliveryDetails);
  }, [cart.deliveryDetails, cart.deliveryPinCode]);
  const set = (key: keyof DeliveryDetails, value: string) => {
    addressEdited.current = true;
    setDetails(current => ({ ...current, [key]: value }));
  };
  const reviewed = cart.deliveryDetails ?? details;
  const deliveryEstimate = reviewed.pincode === cart.deliveryPinCode
    ? getCurrentDeliveryEstimate(cart) : null;
  const deliveryDays = deliveryEstimate ? formatDeliveryDays(deliveryEstimate) : null;
  const deliveryDates = deliveryEstimate ? formatEstimatedDeliveryDateRange(deliveryEstimate) : null;
  const triedDefaultAddress = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (cart.deliveryDetails || triedDefaultAddress.current) return;
    triedDefaultAddress.current = true;
    void (async () => {
      const profile = await fetchCustomerProfile().catch(() => null);
      if (!mounted.current || !profile || addressEdited.current) return;
      // A signed-in customer's saved address is their default, unless the cart is already priced for another pincode.
      if (cart.deliveryPinCode && cart.deliveryPinCode !== profile.pincode) {
        setDetails(current => current.name ? current : { ...profile, pincode: cart.deliveryPinCode ?? profile.pincode });
        return;
      }
      const normalized = normalizeDeliveryDetails(profile);
      if (validateDeliveryDetails(normalized)) { setDetails(current => current.name ? current : profile); return; }
      const saved = await onSave(normalized).catch(() => null);
      if (!mounted.current || !saved?.deliveryDetails) return;
      trackCartStep('add_shipping_info', saved);
      setDetails(saved.deliveryDetails);
      setStep(current => current === 'cart' ? 'review' : current);
    })();
  }, [cart.deliveryDetails, cart.deliveryPinCode, onSave]);
  const startCheckout = async () => {
    if (!pageStep) trackCartStep('begin_checkout', cart);
    if (cart.deliveryDetails) { trackCartStep('add_shipping_info', cart); setStep('review'); return; }
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
        {step === 'contact' ? '1. Contact details' : step === 'address' ? '2. Delivery address' : onlineCheckout ? '3. Review order' : '3. Review order request'}
      </h3>
      <p className="text-xs text-cocoa/65">{onlineCheckout ? 'Guest checkout available. Review your delivery details before paying securely. We will email your order confirmation to your contact email.'
        : 'Guest ordering available. Payment is not enabled; your order still needs confirmation.'}</p>
      {savedAddresses.length > 0 && <label className="block">Deliver to saved address
        <select className="mt-1 w-full rounded border bg-white p-2" disabled={busy || saving}
          value={savedAddresses.find(address => sameAddress(address.details, step === 'review' ? reviewed : details))?.id ?? ''}
          onChange={event => {
            const chosen = savedAddresses.find(address => address.id === event.target.value);
            if (!chosen) return;
            addressEdited.current = true;
            const normalized = normalizeDeliveryDetails({ ...chosen.details, email: chosen.details.email || details.email });
            setDetails(normalized); setError('');
            const validation = validateDeliveryDetails(normalized);
            if (validation || (onlineCheckout && !normalized.email)) {
              setStep('contact');
              setError(validation ?? 'Add a contact email before using this saved address.');
              return;
            }
            setSaving(true);
            void onSave(normalized).then(saved => {
              if (!saved?.deliveryDetails) throw new Error('Delivery details were not saved. Please retry.');
              trackCartStep('add_shipping_info', saved);
              setDetails(saved.deliveryDetails); setStep('review'); onReview?.();
            }).catch(error => setError(error instanceof Error ? error.message : 'Unable to use that address.'))
              .finally(() => setSaving(false));
          }}>
          {!savedAddresses.some(address => sameAddress(address.details, step === 'review' ? reviewed : details)) &&
            <option value="">Choose a saved address or enter details below</option>}
          {savedAddresses.map(address => <option key={address.id} value={address.id}>
            {address.details.name} — {address.details.addressLine1}, {address.details.city} {address.details.pincode}{address.isDefault ? ' (default)' : ''}
          </option>)}
        </select>
      </label>}
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
          trackCartStep('add_shipping_info', saved);
          setDetails(saved.deliveryDetails); setStep('review'); onReview?.();
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
          <label className="block">{onlineCheckout ? 'Contact email' : 'Contact email (optional)'}
            <input type="email" required={onlineCheckout} maxLength={254} autoComplete="email" value={details.email} disabled={busy || saving}
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
          <button type="button" disabled={busy || saving} onClick={() => {
            if (step === 'contact' && onBack) onBack();
            else setStep(step === 'contact' ? 'cart' : 'contact');
          }} className="underline">Back</button>
          <button disabled={busy || saving} className="rounded-full bg-cocoa px-4 py-2 text-white">
            {saving ? 'Saving…' : step === 'contact' ? 'Continue to address' : 'Save and review'}
          </button>
        </div>
      </form>}
      {step === 'review' && <>
        <p className="break-words">{reviewed.name} · +91 {reviewed.phone}</p>
        {reviewed.email && <p className="break-words">{reviewed.email}</p>}
        <p className="break-words">{deliveryAddressText(reviewed)}</p>
        <section aria-label="Delivery window" className="rounded-xl border border-mustard/30 bg-cream/60 p-3">
          <h4 className="font-semibold">Estimated delivery</h4>
          <p className="mt-1 text-sm">Provisional estimate before courier selection. After packing and booking,
            My orders shows the selected courier's transit estimate and, when available, its latest expected delivery date.</p>
          {deliveryDays && deliveryDates
            ? <><p className="mt-1 font-semibold">Around {deliveryDates}</p>
              <p className="mt-1 text-sm">For pincode {reviewed.pincode}, this estimate combines courier transit of {deliveryDays} with 1–5 days for preparation and dispatch after order confirmation. This range assumes you order today; dates are approximate and not guaranteed.</p></>
            : <p className="mt-1 text-cocoa/75">A courier transit estimate is not available for pincode {reviewed.pincode} right now. Delivery timing after dispatch will be confirmed with the courier.</p>}
          {reviewed.pincode === cart.deliveryPinCode && cart.deliveryPinCheckedAt && !cart.deliveryPinLocation
            && <p className="mt-2 text-sm text-cocoa/75" role="status">
              We could not confirm this PIN’s postal area. Please double-check it; Luvia will confirm delivery availability.
            </p>}
        </section>
        {cart.welcomeCouponCode && <p className="break-words">{cart.coupon
          ? totals.couponShortfall > 0
            ? `Coupon ${cart.coupon.code} not applied: minimum items value not met.`
            : `Coupon ${cart.coupon.code} applied: ${cart.coupon.percent}% off (up to ${formatINR(cart.coupon.maxDiscountRupees)}) on items worth ${formatINR(cart.coupon.minimumSubtotalRupees)}+`
          : `Requested coupon: ${cart.welcomeCouponCode} (subject to confirmation)`}</p>}
        <p className="text-xs">{onlineCheckout ? 'Review your items, coupon, shipping and total, then pay securely with Razorpay.'
          : 'Review your cart items and estimated total, then send the order request using WhatsApp or email.'}</p>
        {onlineCheckout && !reviewed.email?.trim() && <p role="alert" className="text-xs text-red-700">Edit details and add a contact email to receive your order confirmation before payment.</p>}
        <button type="button" disabled={busy} onClick={() => {
          if (onEdit) onEdit();
          else { setDetails(reviewed); setStep('contact'); }
        }} className="underline">Edit details</button>
        <form className="space-y-2" onSubmit={event => {
          event.preventDefault(); setSaving(true); setError('');
          void onCoupon(couponCode).catch(error => setError(error instanceof Error ? error.message : 'Unable to apply coupon.'))
            .finally(() => setSaving(false));
        }}>
          <label className="block">Coupon code
            <input required maxLength={64} value={couponCode} disabled={busy || saving}
              onChange={event => setCouponCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded border p-2" />
          </label>
          {cart.coupon && totals.couponShortfall > 0 && <p role="alert" className="text-sm text-red-700">
            Add {formatINR(totals.couponShortfall)} more in items to reach the minimum items value of {formatINR(cart.coupon.minimumSubtotalRupees)} before applying {cart.coupon.code}. Shipping does not count towards the minimum.
          </p>}
          <button disabled={busy || saving} className="rounded-full border border-cocoa px-3 py-2">{onlineCheckout ? 'Apply coupon' : 'Apply coupon to request'}</button>
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
