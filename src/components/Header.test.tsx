import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Header from './Header';

afterEach(cleanup);

describe('Header', () => {
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
});
