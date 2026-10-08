import type { ReactNode } from 'react';
import { GOOD_MARGIN_PERCENT } from './priceDiscovery';

interface Props {
  margin: number | null | undefined;
  children: ReactNode;
  className?: string;
}

export default function MarginLabel({ margin, children, className = '' }: Props) {
  const available = margin !== null && margin !== undefined && Number.isFinite(margin);
  const good = available && margin >= GOOD_MARGIN_PERCENT;
  const status = available ? (good ? 'Good' : `Below ${GOOD_MARGIN_PERCENT}%`) : 'Not calculated';
  const colors = available
    ? (good ? 'bg-green-50 text-green-800' : 'text-red-800')
    : 'bg-cream text-cocoa/60';
  const redIntensity = available && !good
    ? 0.06 + 0.19 * Math.min(1, Math.max(0, (GOOD_MARGIN_PERCENT - margin) / GOOD_MARGIN_PERCENT))
    : null;

  return (
    <span
      className={`rounded-lg px-2 py-1 ${colors} ${className}`}
      style={redIntensity === null ? undefined : { backgroundColor: `rgba(220, 38, 38, ${redIntensity})` }}
    >
      {children}
      <span className="ml-2 text-xs font-semibold">{status}</span>
    </span>
  );
}
