import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Header from './Header';

afterEach(cleanup);

describe('Header', () => {
  it('hands the mobile cart to the catalogue toolbar instead of floating over categories', () => {
    const { rerender } = render(<Header mobileCartInToolbar cartItemCount={1} onOpenCart={vi.fn()} showInstallPrompt={false} />);
    const button = screen.getByRole('button', { name: 'Open cart with 1 item' });
    expect(button.className).toContain('absolute top-3 sm:fixed');
    rerender(<Header mobileCartInToolbar hideMobileCart cartItemCount={1} onOpenCart={vi.fn()} showInstallPrompt={false} />);
    expect(button.parentElement?.className).toContain('hidden sm:block');
  });
  it('uses in-app home and collection navigation while preserving modified-click links', () => {
    const onNavigateCatalogue = vi.fn();
    render(<Header showInstallPrompt={false} categories={['Toys']} onNavigateCatalogue={onNavigateCatalogue} />);
    fireEvent.click(screen.getByRole('link', { name: 'Luvia Creations — home' }));
    expect(onNavigateCatalogue).toHaveBeenCalledWith(undefined);
    onNavigateCatalogue.mockClear();
    fireEvent.click(screen.getByRole('link', { name: 'Luvia Creations — home' }), { ctrlKey: true });
    expect(onNavigateCatalogue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('link', { name: 'Toys' }));
    expect(onNavigateCatalogue).toHaveBeenCalledWith('Toys');
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });
  it('opens navigation with real homepage, collection and policy links', () => {
    render(<Header categories={['Charms & Keychains', 'Toys']} showInstallPrompt={false} />);
    const button = screen.getByRole('button', { name: 'Open navigation' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: 'Charms & Keychains' }).getAttribute('href'))
      .toBe('/?category=Charms%20%26%20Keychains');
    expect(screen.getByRole('link', { name: 'Return and refund policy' }).getAttribute('href'))
      .toBe('/return-policy/');
    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });

  it('closes on Escape with focus restored and on an outside pointer click', () => {
    render(<Header showInstallPrompt={false} />);
    const button = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes navigation when opening the cart', () => {
    const onOpenCart = vi.fn();
    render(<Header showInstallPrompt={false} onOpenCart={onOpenCart} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open cart with 0 items' }));
    expect(onOpenCart).toHaveBeenCalledOnce();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });

  it.each([false, true])('links the logo to the homepage with compact=%s', (compact) => {
    render(<Header compact={compact} showInstallPrompt={false} />);
    const link = screen.getByRole('link', { name: 'Luvia Creations — home' });
    expect(link.getAttribute('href')).toBe(import.meta.env.BASE_URL);
    expect(link.contains(screen.getByRole('img', { name: /Luvia/ }))).toBe(true);
  });

  it('keeps mobile branding concise while preserving the heading and desktop introduction', () => {
    const onOpenCart = vi.fn();
    render(<Header showInstallPrompt={false} onOpenCart={onOpenCart} cartItemCount={2} />);
    expect(screen.queryByText('Luvia Creations')).toBeNull();
    const logo = screen.getByRole('img', { name: /Luvia/ });
    expect(logo.className).toContain('h-12 w-12');
    expect(logo.getAttribute('sizes')).toBe('(min-width: 768px) 176px, (min-width: 640px) 144px, 48px');
    expect(screen.getByText('Made with love. Delivered across India.').className).toContain('sm:hidden');
    expect(screen.getByText(/Explore handmade crochet accessories/).className).toContain('hidden sm:inline');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Handmade Crochet Products & Gifts');
    fireEvent.click(screen.getByRole('button', { name: 'Open cart with 2 items' }));
    expect(onOpenCart).toHaveBeenCalledOnce();
  });

  it('preserves the compact header without adding the mobile introduction', () => {
    render(<Header compact showInstallPrompt={false} />);
    expect(screen.getByRole('img', { name: /Luvia/ }).getAttribute('sizes')).toBe('48px');
    expect(screen.queryByText('Luvia Creations')).toBeNull();
    expect(screen.queryByText('Made with love. Delivered across India.')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });

  it('places the product-page logo left with space reserved for the cart', () => {
    render(<Header compact alignLogoLeft showHeading={false} showInstallPrompt={false}
      onOpenCart={vi.fn()} />);
    const logo = screen.getByRole('img', { name: /Luvia/ });
    const row = logo.parentElement?.parentElement?.parentElement;
    expect(row?.className).toContain('justify-start pr-36 text-left');
    expect(row?.className).not.toContain('justify-center');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open cart with 0 items' })).toBeTruthy();
  });
  it('keeps compact store-page branding left-aligned without a cart', () => {
    render(<Header compact alignLogoLeft showHeading={false} showInstallPrompt={false} collectionPages />);
    const logo = screen.getByRole('img', { name: /Luvia/ });
    const row = logo.parentElement?.parentElement?.parentElement;
    expect(row?.className).toContain('justify-start');
    expect(row?.className).not.toContain('justify-center');
  });
});
