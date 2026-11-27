export const getBoundedMetaDescription = (value, limit = 155) => {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const prefix = text.slice(0, limit);
  const boundary = prefix.lastIndexOf(' ');
  return `${(boundary > 0 ? prefix.slice(0, boundary) : prefix.slice(0, limit - 1)).trimEnd()}…`;
};
