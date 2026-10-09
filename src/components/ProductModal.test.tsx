import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../types/product';
import ProductModal from './ProductModal';

const getShareableImageFile = vi.hoisted(() => vi.fn());
vi.mock('../utils/shareImage', async (importOriginal) => ({
  ...await importOriginal<typeof import('../utils/shareImage')>(),
  getShareableImageFile,
}));

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
      price: null,
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
      price: null,
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
      price: null,
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
      price: null,
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
  it.each(['modal', 'page'] as const)('includes the currently selected variant in %s customisation enquiries, even when sold out', (presentation) => {
    render(<ProductModal product={product} presentation={presentation} currentIndex={0} totalProducts={1}
      onClose={vi.fn()} onPrevious={vi.fn()} onNext={vi.fn()} />);
    const request = screen.getByRole('link', { name: 'Request a different colour or customisation' });
    expect(new URL(request.getAttribute('href')!).searchParams.get('text')).toContain('Crochet Rose — Red');
    fireEvent.click(screen.getByRole('button', { name: /Ivory/ }));
    const text = new URL(request.getAttribute('href')!).searchParams.get('text');
    expect(text).toContain('Crochet Rose — Ivory');
    expect(text).toContain('?variant=ivory');
    expect(request.getAttribute('target')).toBe('_blank');
    expect(screen.getByText(/Options, price and dispatch time must be confirmed/)).toBeTruthy();
  });
  it('offers full details while preserving the selected variant', () => {
    const onOpenFullDetails = vi.fn();
    render(<ProductModal product={product} currentIndex={0} totalProducts={1}
      initialVariantId="variant-2" onClose={vi.fn()} onPrevious={vi.fn()} onNext={vi.fn()}
      onOpenFullDetails={onOpenFullDetails} />);
    const link = screen.getByRole('link', { name: 'View full details' });
    expect(link.getAttribute('href')).toContain('?variant=ivory');
    fireEvent.click(link);
    expect(onOpenFullDetails).toHaveBeenCalledWith('variant-2');
    act(() => vi.advanceTimersByTime(7000));
    expect(screen.getByRole('link', { name: 'View full details' }).getAttribute('href')).toContain('?variant=ivory');
  });

  it.each(['modal', 'page'] as const)('includes the currently selected variant in %s WhatsApp enquiries', (presentation) => {
    render(<ProductModal presentation={presentation} product={product}
      currentIndex={0} totalProducts={1} initialVariantId="variant-2"
      onClose={vi.fn()} onPrevious={vi.fn()} onNext={vi.fn()} />);
    const href = screen.getByRole('link', { name: 'Quick order on WhatsApp' }).getAttribute('href')!;
    const text = new URL(href).searchParams.get('text');
    expect(text).toContain("Hi Luvia, I'm interested in Crochet Rose — Ivory.");
    expect(text).not.toContain('Product:');
    expect(text).not.toContain('collection');
    expect(text).toContain('/p/crochet-rose/?variant=ivory');
  });

  it('reuses ordering and zoom as a full page without modal close or product swipes', () => {
    const onClose = vi.fn();
    const onNext = vi.fn();
    render(<ProductModal presentation="page" product={product} currentIndex={0} totalProducts={3}
      onClose={onClose} onPrevious={vi.fn()} onNext={onNext} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(product.name);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close product details' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'View full details' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Quick order on WhatsApp' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open zoomed product image' }).closest('.grid')?.className)
      .toContain('grid-cols-1');
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onClose).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom product image' }));
    expect(screen.getByRole('button', { name: 'Close image zoom' })).toBeTruthy();
  });

  it('shows confirmed product specifications without changing order actions', () => {
    render(
      <ProductModal product={{ ...product, materials: 'Cotton yarn', dimensions: 'Approx. 10 cm', includedItems: 'One rose', careInstructions: 'Spot clean gently.' }}
        currentIndex={0} totalProducts={1} onClose={vi.fn()} onPrevious={vi.fn()} onNext={vi.fn()} />,
    );
    expect(screen.getByText('Cotton yarn')).toBeTruthy();
    expect(screen.getByText('Approx. 10 cm')).toBeTruthy();
    expect(screen.getByText('One rose')).toBeTruthy();
    expect(screen.getByText('Spot clean gently.')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Quick order on WhatsApp' })).toHaveLength(1);
    expect(screen.getByText('Cotton yarn').closest('details')?.open).toBe(false);
  });

  it('keeps specifications and care visible upfront on the full product page', () => {
    const { container } = render(
      <ProductModal presentation="page" product={{ ...product, materials: 'Cotton yarn',
        dimensions: 'Approx. 10 cm', includedItems: 'One rose', careInstructions: 'Spot clean gently.' }}
        currentIndex={0} totalProducts={1} onClose={vi.fn()} onPrevious={vi.fn()} onNext={vi.fn()} />,
    );
    expect(container.querySelectorAll('details')).toHaveLength(1);
    expect(container.querySelector('summary')?.textContent).toBe('Before you order');
    expect(screen.getByText(/does not complete a purchase or take payment/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Shipping & payment information' }).getAttribute('href')).toBe('/faq/');
    expect(screen.getByRole('heading', { name: 'Product details', level: 2 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Care instructions', level: 2 })).toBeTruthy();
    expect(screen.getByText('Cotton yarn').closest('details')).toBeNull();
    expect(screen.getByText('Approx. 10 cm')).toBeTruthy();
    expect(screen.getByText('One rose')).toBeTruthy();
    expect(screen.getByText('Spot clean gently.')).toBeTruthy();
  });

  it('shows explicit ordering labels while keeping the enquiry and cart actions available', () => {
    render(
      <ProductModal product={product} currentIndex={0} totalProducts={1}
        onClose={vi.fn()} onPrevious={vi.fn()} onNext={vi.fn()}
        onAddToCart={vi.fn().mockResolvedValue(true)} />,
    );
    expect(screen.getByRole('link', { name: 'Quick order on WhatsApp' }).textContent).toContain('Order on WhatsApp');
    expect(screen.getByRole('button', { name: 'Add to cart — Crochet Rose' }).textContent).toContain('Add to cart');
    expect(screen.queryByRole('link', { name: 'Order / Enquire on WhatsApp' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Close$/ })).toBeNull();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    getShareableImageFile.mockReset().mockResolvedValue(null);
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('manages the selected variant independently from the product image', () => {
    const { onAddToCart, onUpdateCartItem, onRemoveCartItem } = renderModalWithCart();

    expect(screen.getByLabelText('2 of Red in cart')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Decrease quantity of Crochet Rose — Red',
      }),
    );
    expect(onUpdateCartItem).toHaveBeenCalledWith('cart-item-red', 1, 1);

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
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    vi.unstubAllGlobals();
  });

  it('reveals controls after touching the details area and hides them after two seconds', () => {
    renderModal();
    const description = screen.getByText(product.description);
    const controls = [
      screen.getByRole('button', { name: 'Show previous product' }),
      screen.getByRole('button', { name: 'Show next product' }),
    ];

    for (const control of controls) {
      expect(control.style.opacity).toBe('0');
      expect(control.style.pointerEvents).toBe('none');
    }
    const close = screen.getByRole('button', { name: 'Close product details' });
    expect(close.style.opacity).not.toBe('0');
    expect(close.style.pointerEvents).not.toBe('none');

    fireEvent.touchStart(description, { touches: [touch(180, 600)] });

    for (const control of controls) {
      expect(control.style.opacity).toBe('1');
      expect(control.style.pointerEvents).toBe('auto');
    }

    act(() => vi.advanceTimersByTime(2000));
    expect(close.style.opacity).not.toBe('0');
    expect(close.style.pointerEvents).not.toBe('none');

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

  it('does not switch products when swiping the variant or thumbnail rails', () => {
    const { onNext, onPrevious } = renderModal();
    const variantRail = screen.getByRole('button', { name: /Ivory/ });
    const thumbnail = screen.getByRole('button', { name: 'Show main product image' });

    for (const rail of [variantRail, thumbnail]) {
      fireEvent.touchStart(rail, { touches: [touch(300, 600)] });
      fireEvent.touchEnd(rail, { changedTouches: [touch(100, 605)] });
      fireEvent.touchStart(rail, { touches: [touch(100, 600)] });
      fireEvent.touchEnd(rail, { changedTouches: [touch(300, 595)] });
    }

    expect(onNext).not.toHaveBeenCalled();
    expect(onPrevious).not.toHaveBeenCalled();
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
    expect(screen.getByRole('link', { name: 'Quick order on WhatsApp' }).getAttribute('href')).toContain(
      '%E2%80%94%20Ivory',
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
    // Ivory has no angle photos of its own, so the strip drops away rather
    // than degrading into a second copy of the variant picker.
    expect(screen.queryByLabelText('Product image angles')).toBeNull();
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

  it('stops auto-rotating once a variant is chosen so the order keeps that variant', () => {
    renderModal(variantImageProduct);

    fireEvent.click(screen.getByRole('button', { name: 'Side' }));
    expect(
      screen.getByRole('img', { name: 'Variant Image Product — Side' }).getAttribute('src'),
    ).toBe('/side.jpg');

    act(() => vi.advanceTimersByTime(3500 * 3));

    expect(
      screen.getByRole('img', { name: 'Variant Image Product — Side' }).getAttribute('src'),
    ).toBe('/side.jpg');
    expect(screen.getByRole('button', { name: 'Side' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('hides the angle thumbnail strip when it would just repeat the variant picker', () => {
    renderModal(variantImageProduct);

    expect(screen.queryByLabelText('Product image angles')).toBeNull();
    expect(screen.getByRole('button', { name: 'Side' })).toBeTruthy();
  });

  it('still shows the angle thumbnail strip for a variant with its own photos', () => {
    renderModal();

    expect(screen.getByLabelText('Product image angles')).toBeTruthy();
  });

  it('does not prepare a share photo until the share panel opens', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Show product image 2' }));
    expect(getShareableImageFile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Share this product' }));
    expect(getShareableImageFile).toHaveBeenCalledOnce();
    expect(getShareableImageFile).toHaveBeenCalledWith('/rose-top.jpg', expect.any(String));
  });

  it('uses a resized image in the modal and reserves a larger version for zoom', () => {
    const original = 'https://example.supabase.co/storage/v1/object/public/product-images/rose.jpg';
    renderModal({
      ...product,
      image: original,
      variants: [{ ...product.variants[0], image: original, gallery: [] }],
    });

    expect(screen.getByRole('img', { name: 'Crochet Rose' }).getAttribute('src')).toContain('width=960');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom product image' }));
    expect(
      screen.getByRole('dialog', { name: 'Zoomed image of Crochet Rose' })
        .querySelector('img')?.getAttribute('src'),
    ).toContain('width=1600');
    expect(getShareableImageFile).not.toHaveBeenCalled();
  });

  it('does not share a stale photo after the selected image changes', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share, canShare: vi.fn().mockReturnValue(true) });
    getShareableImageFile.mockResolvedValue(new File(['rose'], 'rose.webp', { type: 'image/webp' }));
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Share this product' }));
    await act(async () => { await Promise.resolve(); });

    getShareableImageFile.mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByRole('button', { name: 'Show product image 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Share to apps' }));

    expect(share.mock.calls[0][0]).toHaveProperty('url');
    expect(share.mock.calls[0][0]).not.toHaveProperty('files');
  });

  it('opens, controls, and closes image zoom without closing the product modal', () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Open zoomed product image' }));
    expect(screen.getByRole('dialog', { name: 'Zoomed image of Crochet Rose — Red' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Zoomed image of Crochet Rose — Red' })).toBeNull();

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

    const pointer = { pointerId: 1, pointerType: 'touch' };
    fireEvent.pointerDown(zoomSurface!, { ...pointer, clientX: 260, clientY: 300 });
    fireEvent.pointerMove(zoomSurface!, { ...pointer, clientX: 200, clientY: 304 });
    fireEvent.pointerMove(zoomSurface!, { ...pointer, clientX: 80, clientY: 310 });
    fireEvent.pointerUp(zoomSurface!, { ...pointer, clientX: 80, clientY: 310 });

    expect(image?.getAttribute('src')).toBe('/rose-top.jpg');
  });

  it('moves through every variant and its angles in the zoom viewer', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom product image' }));
    const zoomedSrc = () =>
      screen.getByRole('dialog', { name: /^Zoomed image of Crochet Rose/ })
        .querySelector('img')?.getAttribute('src');
    const next = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Show next zoomed product image' }));
    const previous = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Show previous zoomed product image' }));

    expect(zoomedSrc()).toBe('/rose.jpg');
    next();
    expect(zoomedSrc()).toBe('/rose-top.jpg');
    next();
    expect(zoomedSrc()).toBe('/rose-side.jpg');
    next();
    expect(zoomedSrc()).toBe('/rose-ivory.jpg');
    expect(screen.getByRole('dialog', { name: 'Zoomed image of Crochet Rose — Ivory' })).toBeTruthy();
    next();
    expect(zoomedSrc()).toBe('/rose.jpg');
    previous();
    expect(zoomedSrc()).toBe('/rose-ivory.jpg');
    previous();
    expect(zoomedSrc()).toBe('/rose-side.jpg');
    expect(screen.getByRole('dialog', { name: 'Zoomed image of Crochet Rose — Red' })).toBeTruthy();
  });

  it('reaches the angle variant when zoom starts on a variant without angles', () => {
    render(
      <ProductModal
        product={product}
        currentIndex={0}
        totalProducts={1}
        onClose={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        initialVariantId="variant-2"
      />,
    );

    expect(screen.queryByLabelText('Product image angles')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom product image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show next zoomed product image' }));
    expect(
      screen.getByRole('dialog', { name: 'Zoomed image of Crochet Rose — Red' })
        .querySelector('img')?.getAttribute('src'),
    ).toBe('/rose.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Show next zoomed product image' }));
    expect(
      screen.getByRole('dialog', { name: 'Zoomed image of Crochet Rose — Red' })
        .querySelector('img')?.getAttribute('src'),
    ).toBe('/rose-top.jpg');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('button', { name: /Red/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Show product image 2' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the same zoomed image after a short drag', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom product image' }));

    const zoomDialog = screen.getByRole('dialog', { name: 'Zoomed image of Crochet Rose — Red' });
    const image = zoomDialog.querySelector('img[alt="Crochet Rose — Red"]');
    const zoomSurface = image!.parentElement!;
    const originalSrc = image!.getAttribute('src');
    const pointer = { pointerId: 1, pointerType: 'touch' };
    fireEvent.pointerDown(zoomSurface, { ...pointer, clientX: 260, clientY: 300 });
    fireEvent.pointerMove(zoomSurface, { ...pointer, clientX: 240, clientY: 300 });
    fireEvent.pointerUp(zoomSurface, { ...pointer, clientX: 240, clientY: 300 });

    expect(image!.getAttribute('src')).toBe(originalSrc);
  });

});
