import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Header from './Header';

afterEach(cleanup);

describe('Header', () => {
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
    expect(logo.className).toContain('h-16 w-16');
    expect(logo.getAttribute('sizes')).toBe('(min-width: 768px) 176px, (min-width: 640px) 144px, 64px');
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
    expect(row?.className).toContain('justify-start pr-20 text-left');
    expect(row?.className).not.toContain('justify-center');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open cart with 0 items' })).toBeTruthy();
  });
});
