import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../types/product';
import ProductModal from './ProductModal';

const product: Product = {
  id: 'product-1',
  name: 'Crochet Rose',
  category: 'Flowers',
  price: 0,
  description: 'A handmade crochet rose for gifting.',
  color: '#f6c453',
  inStock: true,
  image: '/rose.jpg',
};

const renderModal = () => {
  const callbacks = {
    onClose: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
  };

  render(
    <ProductModal
      product={product}
      currentIndex={0}
      totalProducts={3}
      {...callbacks}
    />,
  );

  return callbacks;
};

const touch = (clientX: number, clientY: number) => ({ clientX, clientY });

describe('ProductModal touch controls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('reveals controls after touching the details area and hides them after two seconds', () => {
    renderModal();
    const description = screen.getByText(product.description);
    const controls = [
      screen.getByRole('button', { name: 'Show previous product' }),
      screen.getByRole('button', { name: 'Show next product' }),
      screen.getByRole('button', { name: 'Close product details' }),
    ];

    for (const control of controls) {
      expect(control.style.opacity).toBe('0');
      expect(control.style.pointerEvents).toBe('none');
    }

    fireEvent.touchStart(description, { touches: [touch(180, 600)] });

    for (const control of controls) {
      expect(control.style.opacity).toBe('1');
      expect(control.style.pointerEvents).toBe('auto');
    }

    act(() => vi.advanceTimersByTime(2000));

    for (const control of controls) {
      expect(control.style.opacity).toBe('0');
      expect(control.style.pointerEvents).toBe('none');
    }
  });

  it('navigates on horizontal swipes from the details area in both directions', () => {
    const { onNext, onPrevious } = renderModal();
    const description = screen.getByText(product.description);

    fireEvent.touchStart(description, { touches: [touch(300, 600)] });
    fireEvent.touchEnd(description, { changedTouches: [touch(100, 610)] });
    expect(onNext).toHaveBeenCalledOnce();

    fireEvent.touchStart(description, { touches: [touch(100, 600)] });
    fireEvent.touchEnd(description, { changedTouches: [touch(300, 590)] });
    expect(onPrevious).toHaveBeenCalledOnce();
  });

  it('does not navigate for vertical movement or short horizontal touches', () => {
    const { onNext, onPrevious } = renderModal();
    const description = screen.getByText(product.description);

    fireEvent.touchStart(description, { touches: [touch(180, 650)] });
    fireEvent.touchEnd(description, { changedTouches: [touch(190, 450)] });
    fireEvent.touchStart(description, { touches: [touch(180, 600)] });
    fireEvent.touchEnd(description, { changedTouches: [touch(215, 600)] });

    expect(onNext).not.toHaveBeenCalled();
    expect(onPrevious).not.toHaveBeenCalled();
  });
});
