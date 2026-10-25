import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MobileNavigation from './MobileNavigation';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
it('offers five destinations, current collection and working cart, account and more actions', () => {
  window.history.replaceState(null, '', '/collections/toys/');
  const cart = vi.fn(), account = vi.fn(), more = vi.fn();
  render(<MobileNavigation cartItemCount={2} accountName="Tanushree" onOpenCart={cart} onOpenAccount={account} onOpenMore={more} moreOpen={false} moreControls="menu" />);
  expect(screen.getByRole('link', { name: 'Collections' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/');
  fireEvent.click(screen.getByRole('button', { name: 'Open cart with 2 items' }));
  fireEvent.click(screen.getByRole('button', { name: 'My account, signed in as Tanushree' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  expect(cart).toHaveBeenCalledOnce();
  expect(account).toHaveBeenCalledWith('signin');
  expect(more).toHaveBeenCalledOnce();
});
it('keeps checkout free of bottom navigation', () => {
  window.history.replaceState(null, '', '/?checkout=delivery');
  render(<MobileNavigation cartItemCount={0} onOpenMore={vi.fn()} moreOpen={false} moreControls="menu" />);
  expect(screen.queryByRole('navigation')).toBeNull();
});
it('hides for a focused on-screen keyboard, including browsers resizing the layout viewport', () => {
  vi.stubGlobal('innerHeight', 800);
  render(<><input aria-label="Search" /><MobileNavigation cartItemCount={0} onOpenMore={vi.fn()} moreOpen={false} moreControls="menu" /></>);
  const navigation = screen.getByRole('navigation');
  expect(navigation.hidden).toBe(false);
  screen.getByRole('textbox').focus();
  vi.stubGlobal('innerHeight', 450);
  fireEvent(window, new Event('resize'));
  expect(navigation.hidden).toBe(true);
  vi.stubGlobal('innerHeight', 800);
  fireEvent(window, new Event('resize'));
  expect(navigation.hidden).toBe(false);
});
it('does not treat ordinary browser chrome resizing as an open keyboard', () => {
  vi.stubGlobal('innerHeight', 800);
  render(<MobileNavigation cartItemCount={0} onOpenMore={vi.fn()} moreOpen moreControls="menu" />);
  vi.stubGlobal('innerHeight', 600);
  fireEvent(window, new Event('resize'));
  expect(screen.getByRole('navigation').hidden).toBe(false);
  expect(screen.getByRole('button', { name: 'Close navigation' }).getAttribute('aria-controls')).toBe('menu');
});
