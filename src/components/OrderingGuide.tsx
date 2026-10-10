import { trackContactClick } from '../services/analytics';
import { getGeneralWhatsAppLink } from '../utils/whatsapp';
import storeContent from '../content/storeContent.json';

export default function OrderingGuide() {
  return (
    <section
      aria-labelledby="ordering-guide-title"
      className="rounded-2xl border border-mustard/30 bg-white/70 p-4 text-cocoa sm:p-6"
    >
      <h2 id="ordering-guide-title" className="font-heading text-xl font-bold sm:text-2xl">
        How ordering and delivery work
      </h2>
      <ol className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <li>
          <h3 className="font-semibold">1. Choose your items</h3>
          <p className="mt-1 text-cocoa/80">
            Select an available product and colour or variant, then add it to your cart.
          </p>
        </li>
        <li>
          <h3 className="font-semibold">2. Review your order</h3>
          <p className="mt-1 text-cocoa/80">
            Save your delivery address, apply an eligible coupon, and review your items, shipping and total.
            Adding items to your cart or sending a message does not confirm an order.
          </p>
        </li>
        <li>
          <h3 className="font-semibold">3. Proceed to payment</h3>
          <p className="mt-1 text-cocoa/80">
            Pay securely through Razorpay when online checkout is available.
            Your order is confirmed only after payment verification, and confirmation emails are queued
            for you and Luvia. If checkout is unavailable, contact us to confirm your order and payment instructions.
          </p>
        </li>
      </ol>
      <p className="mt-4 text-sm text-cocoa/80">
        We ship across India. Orders are dispatched within 5 days of receiving the order, or earlier.
        Delivery time after dispatch depends on your location.
      </p>
      <p className="mt-2 text-sm text-cocoa/80">
        Shipping is free when the items subtotal after discounts is at least ₹500. Below ₹500,
        the current saved courier estimate rounded up to the next ₹10 applies, or ₹100 without a current estimate.
        Review the shipping charge before paying.
      </p>
      <p className="mt-3 text-sm text-cocoa/80">{storeContent.orderingDisclosure.request}</p>
      <p className="mt-2 text-sm text-cocoa/80">{storeContent.orderingDisclosure.price}</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
        <a href="/faq/" className="py-2 underline underline-offset-4 hover:text-cocoa-dark">Read the ordering FAQ</a>
        <a
          href={getGeneralWhatsAppLink()}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackContactClick('whatsapp', 'ordering_guide')}
          className="py-2 underline underline-offset-4 hover:text-cocoa-dark"
        >
          Ask us on WhatsApp
        </a>
        <a
          href="mailto:orders@luviacreations.com"
          onClick={() => trackContactClick('email', 'ordering_guide')}
          className="py-2 underline underline-offset-4 hover:text-cocoa-dark"
        >
          Email about an order
        </a>
      </div>
    </section>
  );
}
