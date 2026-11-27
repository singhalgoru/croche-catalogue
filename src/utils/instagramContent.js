export const instagramPageTitle = 'Crochet Gifts & Accessories from Instagram';
export const instagramPageDescription = 'Discover handmade crochet gifts, accessories, toys and decor from Luvia Creations, inspired by our recent Instagram posts.';
export const instagramPageIntro = 'Luvia Creations makes handmade crochet gifts, accessories, toys and decor. Explore recent Instagram posts and discover the pieces behind them.';

export const cleanInstagramCaption = value => value
  .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u20E3\u200D]/gu, '')
  .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, ' ')
  .replace(/^[’']s\b\s*/u, '')
  .replace(/\s+/g, ' ')
  .trim();

export const instagramCaptionSummary = (value, limit = 180) => {
  const clean = cleanInstagramCaption(value);
  if (clean.length <= limit) return clean;
  const prefix = clean.slice(0, limit + 1);
  const boundary = prefix.lastIndexOf(' ');
  return `${(boundary > 0 ? prefix.slice(0, boundary) : clean.slice(0, limit)).trimEnd()}…`;
};
