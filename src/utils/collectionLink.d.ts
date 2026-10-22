export function collectionPath(category: string): string;
export function collectionBreadcrumbList(pathname: string, title: string, origin: string): {
  '@type': 'BreadcrumbList';
  itemListElement: { '@type': 'ListItem'; position: number; name: string; item: string }[];
};
