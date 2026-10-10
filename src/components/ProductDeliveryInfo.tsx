export default function ProductDeliveryInfo() {
  return <section aria-label="Delivery and returns" className="mt-4 space-y-2 rounded-xl border border-mustard/30 bg-cream/40 p-3 text-sm text-cocoa">
    <h2 className="font-semibold">Delivery and returns</h2>
    <p>We ship across India. Confirm preparation and dispatch time before paying. Courier delivery estimates start after dispatch; preparation time is additional.</p>
    <p>Shipping is free for orders of ₹500 or more. For smaller orders, save your pincode in the cart for an approximate charge. Final charges and timing are confirmed with your order.</p>
    <p>Returns are accepted for defective, damaged or incorrect items only, not change of mind. Customised items remain eligible for remedies if defective, damaged or incorrectly fulfilled.</p>
    <div className="flex flex-wrap gap-x-4">
      <a href="/faq/" className="inline-flex min-h-11 items-center underline">Delivery FAQ</a>
      <a href="/return-policy/" className="inline-flex min-h-11 items-center underline">Full return and refund policy</a>
    </div>
  </section>;
}
