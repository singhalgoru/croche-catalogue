/**
 * Formats a number as Indian Rupees, e.g. formatINR(1499) -> "₹1,499".
 * Uses the en-IN locale for correct Indian digit grouping (lakh/crore style).
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}
