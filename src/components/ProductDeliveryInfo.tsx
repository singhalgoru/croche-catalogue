import storeContent from '../content/storeContent.json';
import internationalQuote from '../content/internationalQuote.json';

export default function ProductDeliveryInfo({ productId }: { productId?: string }) {
  return <section aria-label="Delivery and returns" className="mt-4 rounded-xl border border-mustard/30 bg-cream/40 p-3 text-sm text-cocoa">
    <p className="flex flex-wrap items-center gap-x-2">
      <a href="/faq/#packaging" className="inline-flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-green-700">
          <path d="M20 4C11 4 5 7 5 14a5 5 0 0 0 5 5c7 0 10-6 10-15Z" />
          <path d="M4 21c3-5 6-8 12-11" />
        </svg>
        {storeContent.packaging.label}
      </a>
      <span>{storeContent.packaging.note}</span>
    </p>
    <p>{storeContent.international.invitation} <a href={`${internationalQuote.path}${productId ? `?product=${encodeURIComponent(productId)}` : ''}`} className="inline-flex min-h-11 items-center underline">Request an international quote</a></p>
    <details>
      <summary className="min-h-11 cursor-pointer content-center font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa">Delivery and returns</summary>
      <div className="mt-2 space-y-2">
        <p>{storeContent.dispatch}</p>
        <p>{storeContent.shipping}</p>
        <p>{storeContent.international.details}</p>
        <p>{storeContent.international.customs}</p>
        <p>{storeContent.international.returns}</p>
        <p>Returns are accepted for defective, damaged or incorrect items only, not change of mind. Customised items remain eligible for remedies if defective, damaged or incorrectly fulfilled.</p>
        <div className="flex flex-wrap gap-x-4">
          <a href="/faq/#faq-delivery" className="inline-flex min-h-11 items-center underline">Delivery FAQ</a>
          <a href="/return-policy/" className="inline-flex min-h-11 items-center underline">Full return and refund policy</a>
        </div>
      </div>
    </details>
  </section>;
}
