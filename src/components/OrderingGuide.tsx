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
          <h3 className="font-semibold">2. Send an order request</h3>
          <p className="mt-1 text-cocoa/80">
            Review your items and quantities, then send them to us using the cart&apos;s WhatsApp button.
            Adding items to your cart or sending a message does not confirm an order.
          </p>
        </li>
        <li>
          <h3 className="font-semibold">3. Confirm details before paying</h3>
          <p className="mt-1 text-cocoa/80">
            We&apos;ll confirm availability, the total including shipping, and the estimated dispatch time.
            Your order is confirmed only after we confirm it with you.
          </p>
        </li>
      </ol>
      <p className="mt-4 text-sm text-cocoa/80">
        We ship across India. Shipping charges and delivery timing depend on your location and order.
        Please agree on the total and dispatch estimate with us before paying; we&apos;ll share payment
        instructions when we confirm your order.
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
