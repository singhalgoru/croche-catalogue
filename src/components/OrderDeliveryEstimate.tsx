import type { OrderFulfilment } from '../types/customer';

export default function OrderDeliveryEstimate({ fulfilment }: { fulfilment: OrderFulfilment }) {
  if (fulfilment.status === 'delivered') return null;
  const estimate = fulfilment.deliveryEstimate;
  const rawDate = estimate?.expectedDate;
  const parsed = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? new Date(`${rawDate}T00:00:00Z`) : null;
  const date = parsed && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === rawDate
    ? new Intl.DateTimeFormat('en-IN',{ timeZone: 'UTC',day: 'numeric',month: 'short',year: 'numeric' }).format(parsed) : null;
  const days = estimate?.transitDays;
  const validDays = typeof days === 'number' && Number.isFinite(days) && days > 0;
  return <section aria-label="Courier delivery estimate" className="mt-3 rounded-lg bg-cream/70 p-3 text-sm">
    {estimate ? <>
      <p className="font-semibold">{estimate.courierName} delivery estimate</p>
      {date ? <p>Courier's expected delivery: {date}</p>
        : validDays ? <p>Estimated transit: about {days} {days === 1 ? 'day' : 'days'} after courier pickup.</p>
        : <p>Waiting for the courier's delivery estimate.</p>}
      <p className="mt-1 text-xs text-cocoa/70">This updates the provisional checkout estimate.
        {!date && ' Pickup timing is additional; an arrival date is not confirmed yet.'}
        {' '}Courier estimates may change and are not guaranteed. Refresh orders for the latest update.</p>
    </> : <p>Delivery timing is provisional until a courier is booked. Preparation time is additional;
      the selected courier's estimate will appear here after booking.</p>}
  </section>;
}
