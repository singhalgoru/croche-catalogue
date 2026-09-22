import type { MouseEvent } from 'react';

/**
 * Deters casual right-click-save / drag-to-save of catalogue photos. This is
 * not real DRM (anyone can still inspect the network tab or view-source to
 * find the image URL) — it only raises the bar for the common case of a
 * visitor right-clicking or dragging a product photo off the page.
 */
export const preventImageContextMenu = (event: MouseEvent<HTMLImageElement>) => {
  event.preventDefault();
};

export const productImageProtection = {
  draggable: false,
  onContextMenu: preventImageContextMenu,
} as const;
