import storeContent from '../content/storeContent.json';

export default function ProductDeliveryInfo() {
  return <section aria-label="Delivery and returns" className="mt-4 rounded-xl border border-mustard/30 bg-cream/40 p-3 text-sm text-cocoa">
    <details>
      <summary className="min-h-11 cursor-pointer content-center font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa">Delivery and returns</summary>
      <div className="mt-2 space-y-2">
        <p>{storeContent.dispatch}</p>
        <p>{storeContent.shipping}</p>
        <p>Returns are accepted for defective, damaged or incorrect items only, not change of mind. Customised items remain eligible for remedies if defective, damaged or incorrectly fulfilled.</p>
        <div className="flex flex-wrap gap-x-4">
          <a href="/faq/" className="inline-flex min-h-11 items-center underline">Delivery FAQ</a>
          <a href="/return-policy/" className="inline-flex min-h-11 items-center underline">Full return and refund policy</a>
        </div>
      </div>
    </details>
  </section>;
}
