import { trackContactClick } from '../services/analytics';
import { getGeneralWhatsAppLink } from '../utils/whatsapp';

export default function OrderingGuide() {
  return (
    <section
      aria-labelledby="ordering-guide-title"
      className="rounded-2xl border border-mustard/30 bg-white/70 p-4 text-cocoa sm:p-6"
    >
      <h2 id="ordering-guide-title" className="font-heading text-xl font-bold sm:text-2xl">
        How to order &amp; delivery
      </h2>
      <ol className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <li>
          <h3 className="font-semibold">1. Choose your favourites</h3>
          <p className="mt-1 text-cocoa/80">Explore the products and select your preferred colour or variant.</p>
        </li>
        <li>
          <h3 className="font-semibold">2. Add to cart</h3>
          <p className="mt-1 text-cocoa/80">Add available items, then review your selections and quantities in the cart.</p>
        </li>
        <li>
          <h3 className="font-semibold">3. Send your order on WhatsApp</h3>
          <p className="mt-1 text-cocoa/80">Use the cart&apos;s WhatsApp option to send your order details. Your order is confirmed with us, not by adding items to the cart.</p>
        </li>
      </ol>
      <p className="mt-4 text-sm text-cocoa/80">
        Shipping is available across India. Contact us to confirm shipping charges and
        the estimated dispatch time before payment.
      </p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
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
