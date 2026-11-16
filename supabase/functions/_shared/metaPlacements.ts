export const metaFeedPlacements = {
  'facebook-feed': 'Facebook Feed only',
  'instagram-feed': 'Instagram Feed only',
  'facebook-instagram-feeds': 'Facebook + Instagram Feeds',
} as const;

export type MetaFeedPlacement = keyof typeof metaFeedPlacements;

export function isMetaFeedPlacement(value: unknown): value is MetaFeedPlacement {
  return typeof value === 'string' && Object.hasOwn(metaFeedPlacements, value);
}

export function usesInstagram(placement: MetaFeedPlacement | undefined): boolean {
  return placement === 'instagram-feed' || placement === 'facebook-instagram-feeds';
}
