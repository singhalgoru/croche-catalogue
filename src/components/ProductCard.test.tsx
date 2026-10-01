import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../types/product';
import ProductCard from './ProductCard';

const getShareableImageFile = vi.hoisted(() => vi.fn());
vi.mock('../utils/shareImage', async (importOriginal) => ({
  ...await importOriginal<typeof import('../utils/shareImage')>(),
  getShareableImageFile,
}));

const product: Product = {
  id: 'rose',
  name: 'Crochet Rose',
  category: 'Flowers',
  price: 200,
  description: 'A handmade rose.',
  color: 'pink',
  inStock: true,
  image: '/rose.jpg',
  variants: [
    {
      id: 'pink',
      name: 'Pink',
      color: 'pink',
      price: null,
      inStock: true,
      availableQuantity: 1,
      image: '/rose.jpg',
      imagePath: 'rose.jpg',
      gallery: [],
    },
    {
      id: 'white',
      name: 'White',
      color: 'white',
      price: null,
      inStock: true,
      availableQuantity: 1,
      image: '/white.jpg',
      imagePath: 'white.jpg',
      gallery: [],
    },
  ],
};

const renderCard = () => render(
  <ProductCard product={product} isFirstProduct onSelect={vi.fn()} onAddToCart={vi.fn()} />,
);

describe('ProductCard share image preparation', () => {
  beforeEach(() => {
    getShareableImageFile.mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('does not download full-size images just because the card is visible or the cart is used', () => {
    renderCard();
    expect(getShareableImageFile).not.toHaveBeenCalled();

    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Add to cart — Crochet Rose' }));
    expect(getShareableImageFile).not.toHaveBeenCalled();
  });

  it('prepares the image only after the share button signals intent', () => {
    renderCard();
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Share Crochet Rose' }));

    expect(getShareableImageFile).toHaveBeenCalledOnce();
    expect(getShareableImageFile).toHaveBeenCalledWith('/rose.jpg', expect.any(String));
  });

  it('does not fetch every carousel image after share intent', () => {
    vi.useFakeTimers();
    try {
      renderCard();
      fireEvent.pointerEnter(screen.getByRole('button', { name: 'Share Crochet Rose' }));
      expect(getShareableImageFile).toHaveBeenCalledOnce();

      act(() => vi.advanceTimersByTime(3500 * 3));
      expect(getShareableImageFile).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shares the link while a requested photo is still loading', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share, canShare: vi.fn().mockReturnValue(true) });
    getShareableImageFile.mockReturnValue(new Promise(() => {}));
    renderCard();

    fireEvent.touchStart(screen.getByRole('button', { name: 'Share Crochet Rose' }));
    fireEvent.click(screen.getByRole('button', { name: 'Share Crochet Rose' }));

    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(share.mock.calls[0][0]).toHaveProperty('url');
    expect(share.mock.calls[0][0]).not.toHaveProperty('files');
  });

  it('shares the selected photo when it is ready', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share, canShare: vi.fn().mockReturnValue(true) });
    const file = new File(['image'], 'rose.webp', { type: 'image/webp' });
    getShareableImageFile.mockResolvedValue(file);
    renderCard();

    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Share Crochet Rose' }));
    await waitFor(() => expect(getShareableImageFile).toHaveBeenCalledOnce());
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'Share Crochet Rose' }));

    expect(share.mock.calls[0][0].files).toEqual([file]);
  });
});
