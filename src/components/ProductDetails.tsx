import { PRODUCT_DETAIL_FIELDS, type ProductDetailValues } from '../utils/productDetails';

export default function ProductDetails({
  product, collapsible = true,
}: { product: ProductDetailValues; collapsible?: boolean }) {
  const specifications = PRODUCT_DETAIL_FIELDS.filter(
    (field) => field.key !== 'careInstructions' && product[field.key]?.trim(),
  );
  const care = product.careInstructions?.trim();
  if (!specifications.length && !care) return null;
  const Section = collapsible ? 'details' : 'section';
  const Heading = collapsible ? 'summary' : 'h2';
  const headingClass = collapsible ? 'cursor-pointer font-semibold' : 'font-semibold';

  return (
    <div className="mt-4 space-y-2 text-sm text-cocoa">
      {specifications.length > 0 && (
        <Section className="rounded-xl border border-mustard/30 bg-cream/40 p-3">
          <Heading className={headingClass}>Product details</Heading>
          <dl className="mt-3 space-y-3">
            {specifications.map(({ key, label }) => (
              <div key={key}>
                <dt className="font-semibold">{label}</dt>
                <dd className="mt-1 whitespace-pre-line break-words text-cocoa/80">{product[key]?.trim()}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      {care && (
        <Section className="rounded-xl border border-mustard/30 bg-cream/40 p-3">
          <Heading className={headingClass}>Care instructions</Heading>
          <p className="mt-3 whitespace-pre-line break-words text-cocoa/80">{care}</p>
        </Section>
      )}
    </div>
  );
}
