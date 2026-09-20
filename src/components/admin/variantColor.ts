const NAMED_COLORS: Record<string, string> = {
  black: '#1f1f1f',
  blue: '#2563eb',
  brown: '#8b5e3c',
  cream: '#fff1cc',
  gold: '#d4a017',
  green: '#2f855a',
  grey: '#6b7280',
  gray: '#6b7280',
  ivory: '#f5f1e8',
  lavender: '#a78bfa',
  maroon: '#800020',
  orange: '#ea580c',
  peach: '#fb9a7a',
  pink: '#ec4899',
  purple: '#7e22ce',
  red: '#b91c1c',
  teal: '#0f766e',
  white: '#ffffff',
  yellow: '#f6c453',
};

export const suggestVariantColor = (name: string) => {
  const words = name.toLowerCase().match(/[a-z]+/g) ?? [];
  const matchedName = words.find((word) => word in NAMED_COLORS);
  return matchedName ? NAMED_COLORS[matchedName] : null;
};
