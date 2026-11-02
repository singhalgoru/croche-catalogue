import type { MouseEvent } from 'react';

/**
 * Deters casual right-click-save / drag-to-save of catalogue photos. This is
 * not real DRM (anyone can still inspect the network tab or view-source to
 * find the image URL) — it only raises the bar for the common case of a
 * visitor right-clicking or dragging a product photo off the page.
 */
export const preventImageContextMenu = (event: MouseEvent<HTMLElement>) => {
  event.preventDefault();
};

const isProtectedMedia = (target: EventTarget | null) =>
  target instanceof Element
  && (target instanceof HTMLImageElement || target instanceof HTMLVideoElement || target instanceof HTMLPictureElement)
  && !target.closest('[data-allow-media-save]');

/** Site-wide safety net so every current and future image/video is covered. */
export const installMediaProtection = (root: Document = document) => {
  const block = (event: Event) => {
    if (isProtectedMedia(event.target)) event.preventDefault();
  };
  root.addEventListener('contextmenu', block);
  root.addEventListener('dragstart', block);
  return () => {
    root.removeEventListener('contextmenu', block);
    root.removeEventListener('dragstart', block);
  };
};

export const productImageProtection = {
  draggable: false,
  onContextMenu: preventImageContextMenu,
  style: {
    WebkitTouchCallout: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none',
  },
} as const;
