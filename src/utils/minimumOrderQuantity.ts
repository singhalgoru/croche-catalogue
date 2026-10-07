export const normalizeMinimumOrderQuantity = (quantity: number | undefined) =>
  typeof quantity === 'number' && Number.isInteger(quantity)
    ? Math.min(Math.max(quantity, 1), 99)
    : 1;

export const getNextCartQuantity = (currentQuantity: number, minimumQuantity: number) =>
  Math.min(
    Math.max(currentQuantity + 1, normalizeMinimumOrderQuantity(minimumQuantity)),
    99,
  );

export const clampCartQuantity = (quantity: number, minimumQuantity: number) =>
  Math.min(
    Math.max(Math.round(quantity), normalizeMinimumOrderQuantity(minimumQuantity)),
    99,
  );
