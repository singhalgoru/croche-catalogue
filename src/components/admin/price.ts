export const parseOptionalPrice = (value: string): number | null | undefined => {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const amount = Number(trimmed);
  return Number.isInteger(amount) && amount >= 0 ? amount : undefined;
};
