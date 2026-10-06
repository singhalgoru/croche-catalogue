export const normalizeDeliveryPin = (value: string): string | null => {
  const pin = value.trim();
  if (!pin) return null;
  if (!/^[1-9][0-9]{5}$/.test(pin)) {
    throw new Error('Enter a valid 6-digit Indian PIN code or keep it empty.');
  }
  return pin;
};
