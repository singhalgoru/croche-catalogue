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
  variants: [
    {
      id: 'variant-1',
      name: 'Red',
      color: '#f6c453',
      inStock: true,
      availableQuantity: 3,
      image: '/rose.jpg',
      imagePath: 'rose.jpg',
      gallery: [
        { id: 'variant-1-top', image: '/rose-top.jpg', imagePath: 'rose-top.jpg' },
        { id: 'variant-1-side', image: '/rose-side.jpg', imagePath: 'rose-side.jpg' },
      ],
    },
    {
      id: 'variant-2',
      name: 'Ivory',
      color: '#fffaf0',
      inStock: false,
      availableQuantity: 0,
      image: '/rose-ivory.jpg',
      imagePath: 'rose-ivory.jpg',
      gallery: [],
    },
  ],
};

const variantImageProduct: Product = {
  ...product,
  id: 'product-variant-images',
  name: 'Variant Image Product',
  variants: [
    {
      id: 'variant-main',
      name: 'Front',
      color: '#f6c453',
      inStock: true,
      availableQuantity: 1,
      image: '/front.jpg',
      imagePath: 'front.jpg',
      gallery: [],
    },
    {
      id: 'variant-side',
      name: 'Side',
      color: '#f6c453',
      inStock: true,
      availableQuantity: 1,
      image: '/side.jpg',
      imagePath: 'side.jpg',
      gallery: [],
    },
  ],
};

const renderModal = (modalProduct = product) => {
  const callbacks = {
    onClose: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
  };

  render(
    <ProductModal
      product={modalProduct}
      currentIndex={0}
      totalProducts={3}
      {...callbacks}
    />,
  );

  return callbacks;
};

const renderModalWithCart = () => {
  const onAddToCart = vi.fn().mockResolvedValue(true);
  const onUpdateCartItem = vi.fn().mockResolvedValue(true);
  const onRemoveCartItem = vi.fn().mockResolvedValue(true);
  const cartItem = {
    id: 'cart-item-red',
    productId: product.id,
    variantId: 'variant-1',
    productName: product.name,
    variantName: 'Red',
    image: '/rose.jpg',
    unitPrice: null,
    quantity: 2,
  };

  render(
    <ProductModal
      product={product}
      currentIndex={0}
      totalProducts={3}
      onClose={vi.fn()}
      onPrevious={vi.fn()}
      onNext={vi.fn()}
      onAddToCart={onAddToCart}
      getCartQuantity={(_productId, variantId) => (variantId === 'variant-1' ? 2 : 0)}
      getCartItem={(_productId, variantId) =>
        variantId === 'variant-1' ? cartItem : undefined
      }
      onUpdateCartItem={onUpdateCartItem}
      onRemoveCartItem={onRemoveCartItem}
    />,
  );

  return { onAddToCart, onUpdateCartItem, onRemoveCartItem };
};

const touch = (clientX: number, clientY: number) => ({ clientX, clientY });

describe('ProductModal touch controls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('manages the selected variant independently from the product image', () => {
    const { onAddToCart, onUpdateCartItem, onRemoveCartItem } = renderModalWithCart();

    expect(screen.getByLabelText('2 of Red in cart')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Decrease quantity of Crochet Rose — Red',
      }),
    );
    expect(onUpdateCartItem).toHaveBeenCalledWith('cart-item-red', 1);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Increase quantity of Crochet Rose — Red',
      }),
    );
    expect(onAddToCart).toHaveBeenCalledWith(product, product.variants[0]);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove Crochet Rose — Red from cart',
      }),
    );
    expect(onRemoveCartItem).toHaveBeenCalledWith('cart-item-red');

    fireEvent.click(screen.getByRole('button', { name: /Ivory/ }));
    expect(screen.queryByLabelText('2 of Red in cart')).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: 'Increase quantity of Crochet Rose — Ivory',
      }),
    ).toBeNull();
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

  it('navigates products on horizontal swipes even when gallery photos exist', () => {
    const { onNext, onPrevious } = renderModal();
    const description = screen.getByText(product.description);
    const mainImage = screen.getByRole('img', { name: 'Crochet Rose — Red' });

    fireEvent.touchStart(description, { touches: [touch(300, 600)] });
    fireEvent.touchEnd(description, { changedTouches: [touch(100, 610)] });
    expect(onNext).toHaveBeenCalledOnce();
    expect(mainImage.getAttribute('src')).toBe('/rose.jpg');

    fireEvent.touchStart(description, { touches: [touch(100, 600)] });
    fireEvent.touchEnd(description, { changedTouches: [touch(300, 590)] });
    expect(onPrevious).toHaveBeenCalledOnce();
    expect(mainImage.getAttribute('src')).toBe('/rose.jpg');
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

  it('switches the product image, stock status, and both WhatsApp order links by variant', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Ivory/ }));

    expect(screen.getByRole('img', { name: 'Crochet Rose — Ivory' }).getAttribute('src')).toBe(
      '/rose-ivory.jpg',
    );
    expect(screen.getAllByText('Sold out', { exact: true })).toHaveLength(2);
    expect(
      screen.getByRole('link', { name: 'Order / Enquire on WhatsApp' }).getAttribute('href'),
    ).toContain('%E2%80%9CIvory%E2%80%9D');
    expect(screen.getByRole('link', { name: 'Quick order on WhatsApp' }).getAttribute('href')).toContain(
      '%E2%80%9CIvory%E2%80%9D',
    );
  });

  it('switches the displayed image via the angle thumbnail strip and resets when the variant changes', () => {
    renderModal();

    const mainImage = screen.getByRole('img', { name: 'Crochet Rose — Red' });
    expect(mainImage.getAttribute('src')).toBe('/rose.jpg');

    fireEvent.click(screen.getByRole('button', { name: 'Show product image 2' }));
    expect(screen.getByRole('img', { name: 'Crochet Rose — Red' }).getAttribute('src')).toBe('/rose-top.jpg');

    // Switching variants resets the active angle back to the main image.
    fireEvent.click(screen.getByRole('button', { name: /Ivory/ }));
    expect(screen.getByRole('img', { name: 'Crochet Rose — Ivory' }).getAttribute('src')).toBe(
      '/rose-ivory.jpg',
    );
    expect(screen.getByRole('button', { name: 'Show main product image' })).toBeTruthy();
  });

  it('automatically rotates through image angles', () => {
    renderModal();

    const mainImage = screen.getByRole('img', { name: 'Crochet Rose — Red' });
    expect(mainImage.getAttribute('src')).toBe('/rose.jpg');

    act(() => vi.advanceTimersByTime(3500));
    expect(mainImage.getAttribute('src')).toBe('/rose-top.jpg');

    act(() => vi.advanceTimersByTime(3500));
    expect(mainImage.getAttribute('src')).toBe('/rose-side.jpg');
  });

  it('automatically rotates variant images when no gallery angles exist', () => {
    renderModal(variantImageProduct);

    const mainImage = screen.getByRole('img', {
      name: 'Variant Image Product — Front',
    });
    expect(mainImage.getAttribute('src')).toBe('/front.jpg');

    act(() => vi.advanceTimersByTime(3500));

    expect(
      screen.getByRole('img', { name: 'Variant Image Product — Side' }).getAttribute('src'),
    ).toBe('/side.jpg');
  });

  it('opens, controls, and closes image zoom without closing the product modal', () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom product image' }));
    expect(screen.getByRole('dialog', { name: 'Zoomed image of Crochet Rose — Red' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByRole('button', { name: 'Reset zoom' }).textContent).toBe('150%');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Zoomed image of Crochet Rose — Red' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Crochet Rose' })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('switches image angles from the zoom viewer', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom product image' }));
    expect(screen.getByRole('dialog', { name: 'Zoomed image of Crochet Rose — Red' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show next zoomed product image' }));

    const zoomDialog = screen.getByRole('dialog', { name: 'Zoomed image of Crochet Rose — Red' });
    expect(
      zoomDialog.querySelector('img[alt="Crochet Rose — Red"]')?.getAttribute('src'),
    ).toBe('/rose-top.jpg');
  });

  it('switches image angles from a mobile swipe in the zoom viewer', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom product image' }));

    const zoomDialog = screen.getByRole('dialog', { name: 'Zoomed image of Crochet Rose — Red' });
    const image = zoomDialog.querySelector('img[alt="Crochet Rose — Red"]');
    const zoomSurface = image?.parentElement;
    expect(zoomSurface).toBeTruthy();

    fireEvent.touchStart(zoomSurface!, {
      touches: [{ clientX: 260, clientY: 300 }],
    });
    fireEvent.touchEnd(zoomSurface!, {
      changedTouches: [{ clientX: 80, clientY: 310 }],
    });

    expect(image?.getAttribute('src')).toBe('/rose-top.jpg');
  });

});
