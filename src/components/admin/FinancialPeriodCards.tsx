export default function FinancialPeriodCards({ cards }: {
  cards: { label: string; metrics: { label: string; value: string }[]; action?: { label: string; onClick: () => void } }[];
}) {
  return <div className="mt-4 grid gap-3 sm:grid-cols-2">
    {cards.map((card, index) => <article key={card.label} aria-label={card.label}
      className={`min-w-0 rounded-2xl border border-mustard/40 p-4 ${index === 0 ? 'bg-cream/70 sm:col-span-2' : 'bg-white'}`}>
      <h4 className="font-heading text-lg font-bold text-cocoa">{card.label}</h4>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm text-cocoa">
        {card.metrics.map(metric => <div key={metric.label} className="min-w-0">
          <dt className="text-xs text-cocoa/65">{metric.label}</dt>
          <dd className="break-words font-bold">{metric.value}</dd>
        </div>)}
      </dl>
      {card.action && <button type="button" onClick={card.action.onClick}
        className="mt-3 min-h-11 text-sm font-semibold underline underline-offset-4">
        {card.action.label}
      </button>}
    </article>)}
  </div>;
}
