import { FREE_SHIPPING_THRESHOLD, INDICATIVE_SHIPPING_CHARGE } from '../utils/cartMessage';
import { formatINR } from '../utils/currency';

export default function ProductPurchaseAssurance() {
  return (
    <section aria-label="Delivery summary" className="col-span-full rounded-xl border border-mustard/30 bg-cream/60 px-3 py-2 text-left text-[11px] leading-snug text-cocoa/80">
      <p><span className="font-semibold text-cocoa">Dispatch:</span> Within 5 days; transit varies by destination.</p>
      <p className="mt-1"><span className="font-semibold text-cocoa">Shipping:</span> Free at {formatINR(FREE_SHIPPING_THRESHOLD)}+ after coupon discounts. Otherwise check pincode in cart; {formatINR(INDICATIVE_SHIPPING_CHARGE)} indicative if no estimate.</p>
    </section>
  );
}
