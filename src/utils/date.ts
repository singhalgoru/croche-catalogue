export const localDate = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatDate = (value: string): string =>
  value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');

export const parseDateInput = (value: string): string =>
  value.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1');

export const isValidDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(`${value}T00:00:00Z`);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};
