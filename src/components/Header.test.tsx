import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Header from './Header';
import { signOutCustomer } from '../services/customer';
vi.mock('../services/customer', () => ({ signOutCustomer: vi.fn() }));
vi.mock('./MobileNavigation', () => ({ default: () => null }));

afterEach(cleanup);
beforeAll(() => vi.stubGlobal('ResizeObserver', class {
  observe() {}
  disconnect() {}
}));
afterAll(() => vi.unstubAllGlobals());

describe('Header', () => {
  it('shows a separate desktop greeting for signed-in customers and removes it after logout', () => {
    const view = render(<Header accountName="Asha" showInstallPrompt={false} />);
    const greeting = screen.getByText('Hello, Asha');
    expect(greeting.parentElement?.className).toContain('hidden');
    expect(greeting.parentElement?.className).toContain('lg:flex');
    expect(greeting.className).toContain('truncate');
    view.rerender(<Header accountName={null} showInstallPrompt={false} />);
    expect(screen.queryByText('Hello, Asha')).toBeNull();
  });
  it('offers an accessible search link without opening the navigation menu', () => {
    render(<Header showInstallPrompt={false} />);
    expect(screen.getByRole('link', { name: 'Search products' }).getAttribute('href')).toBe('/search/');
  });
  it('opens My orders from the main menu for signed-in customers', () => {
    const orders = vi.fn();
    const account = vi.fn();
    render(<Header showInstallPrompt={false} accountName="Asha" onOpenAccount={account} onOpenOrders={orders} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'My orders' }));
    expect(orders).toHaveBeenCalledOnce();
    expect(account).not.toHaveBeenCalled();
  });
  it('uses mustard fill for every seasonal menu category, not just the featured ticker category', () => {
    render(<Header showInstallPrompt={false} categories={['Navratri', 'Diwali', 'Toys']} seasonalCategories={['Navratri', 'Diwali']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('link', { name: 'Navratri' }).classList.contains('bg-mustard')).toBe(true);
    expect(screen.getByRole('link', { name: 'Diwali' }).classList.contains('bg-mustard')).toBe(true);
    expect(screen.getByRole('link', { name: 'Toys' }).classList.contains('bg-mustard')).toBe(false);
  });
  it('links the featured seasonal announcement to the collection page', () => {
    render(<Header showInstallPrompt={false} seasonalAnnouncement={{ name: 'Navaratri', text: 'Check out our Navaratri collection' }} />);
    expect(screen.getByRole('link', { name: 'Check out our Navaratri collection' }).getAttribute('href')).toBe('/collections/navaratri/');
    const duplicate = screen.getByRole('link', { hidden: true, name: '' });
    expect(duplicate.getAttribute('tabindex')).toBe('-1');
  });
  it('signs out from the menu and shows explicit confirmation', async () => {
    vi.mocked(signOutCustomer).mockReset().mockResolvedValue(undefined);
    const view = render(<Header showInstallPrompt={false} onOpenAccount={vi.fn()} accountName="Asha" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(signOutCustomer).toHaveBeenCalledTimes(1));
    expect((await screen.findByRole('status')).textContent).toContain('Signed out successfully.');
    view.rerender(<Header showInstallPrompt={false} onOpenAccount={vi.fn()} accountName={null} />);
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });
  it('reports sign-out failure without removing account controls', async () => {
    vi.mocked(signOutCustomer).mockReset().mockRejectedValue(new Error('Unable to sign out: offline'));
    render(<Header showInstallPrompt={false} onOpenAccount={vi.fn()} accountName="Asha" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect((await screen.findByRole('alert')).textContent).toContain('offline');
    expect(screen.getByRole('button', { name: 'My account' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' }).hasAttribute('disabled')).toBe(false);
  });
  it('keeps sign in and create account in the menu without a separate header icon', () => {
    const onOpenAccount = vi.fn();
    render(<Header showInstallPrompt={false} onOpenCart={vi.fn()} onOpenAccount={onOpenAccount} />);
    expect(screen.queryByRole('button', { name: 'Sign in or create account' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onOpenAccount).toHaveBeenLastCalledWith('signin');
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(onOpenAccount).toHaveBeenLastCalledWith('signup');
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });
  it('shows the signed-in customer name and an account entry instead of sign-in buttons', () => {
    const onOpenAccount = vi.fn();
    render(<Header showInstallPrompt={false} onOpenCart={vi.fn()} onOpenAccount={onOpenAccount} accountName="Asha" />);
    const menu = screen.getByRole('button', { name: 'Open navigation', description: 'Signed in as Asha' });
    expect(menu.querySelector('span[aria-hidden="true"]')?.textContent).toBe('A');
    expect(screen.queryByRole('button', { name: 'My account, signed in as Asha' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('navigation', { name: 'Main navigation' }).textContent).toContain('Signed in as Asha');
    expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'My account' }));
    expect(onOpenAccount).toHaveBeenCalledWith('signin');
  });
  it('keeps account controls opt-in', () => {
    render(<Header showInstallPrompt={false} />);
    expect(screen.queryByRole('button', { name: 'Sign in or create account' })).toBeNull();
  });
  it('adds an initial badge after login and removes it after logout in compact headers', () => {
    const props = { compact: true, showInstallPrompt: false, onOpenAccount: vi.fn() };
    const view = render(<Header {...props} accountName={null} />);
    expect(screen.queryByRole('button', { name: /My account, signed in as/ })).toBeNull();
    view.rerender(<Header {...props} accountName="Tanushree" />);
    const menu = screen.getByRole('button', { name: 'Open navigation', description: 'Signed in as Tanushree' });
    expect(menu.querySelector('span[aria-hidden="true"]')?.textContent).toBe('T');
    view.rerender(<Header {...props} accountName={null} />);
    expect(screen.getByRole('button', { name: 'Open navigation' }).getAttribute('aria-describedby')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open navigation' }).querySelector('span')).toBeNull();
    expect(screen.queryByRole('button', { name: /My account, signed in as/ })).toBeNull();
  });
  it('never floats the header cart on mobile', () => {
    render(<Header showInstallPrompt={false} cartItemCount={1} onOpenCart={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Open cart with 1 item' });
    expect(button.className.split(/\s+/)).not.toContain('fixed');
    expect(button.className).toContain('sm:fixed');
  });
  it('keeps the top cart for desktop rather than duplicating the mobile bottom cart', () => {
    render(<Header cartItemCount={1} onOpenCart={vi.fn()} showInstallPrompt={false} />);
    const button = screen.getByRole('button', { name: 'Open cart with 1 item' });
    expect(button.className).toContain('absolute top-3 sm:fixed');
    expect(button.parentElement?.classList.contains('hidden')).toBe(true);
    expect(button.parentElement?.classList.contains('sm:block')).toBe(true);
  });
  it('uses in-app home navigation but leaves collection page links to the browser', () => {
    const onNavigateCatalogue = vi.fn();
    render(<Header showInstallPrompt={false} categories={['Toys']} onNavigateCatalogue={onNavigateCatalogue} />);
    fireEvent.click(screen.getByRole('link', { name: 'Luvia Creations — home' }));
    expect(onNavigateCatalogue).toHaveBeenCalledWith(undefined);
    onNavigateCatalogue.mockClear();
    fireEvent.click(screen.getByRole('link', { name: 'Luvia Creations — home' }), { ctrlKey: true });
    expect(onNavigateCatalogue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const collection = screen.getByRole('link', { name: 'Toys' });
    expect(collection.getAttribute('href')).toBe('/collections/toys/');
    fireEvent.click(collection, { ctrlKey: true });
    expect(onNavigateCatalogue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('link', { name: 'Toys' }));
    expect(onNavigateCatalogue).not.toHaveBeenCalled();
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
      .toBe('/collections/charms-keychains/');
    expect(screen.getByRole('link', { name: 'Return and refund policy' }).getAttribute('href'))
      .toBe('/return-policy/');
    expect(screen.getByRole('link', { name: 'Collaborate with us' }).getAttribute('href'))
      .toBe('#collaborate');
    fireEvent.click(screen.getByRole('link', { name: 'Collaborate with us' }));
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });
  it('can hide the collaboration link when its section is unavailable', () => {
    render(<Header showCollaborationLink={false} showInstallPrompt={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.queryByRole('link', { name: 'Collaborate with us' })).toBeNull();
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
    expect(logo.className).toContain('h-20 w-20');
    expect(logo.getAttribute('sizes')).toBe('(min-width: 768px) 176px, (min-width: 640px) 144px, 80px');
    expect(screen.getAllByText('Shipping across India · International orders by enquiry').some(element => element.className.includes('sm:hidden'))).toBe(true);
    expect(screen.getByText('Discover thoughtfully crafted crochet accessories, gifts, toys and decor by Luvia. Handmade in India and shipped nationwide and internationally.').className).toContain('hidden sm:inline');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Premium Handmade Crochet Creations');
    fireEvent.click(screen.getByRole('button', { name: 'Open cart with 2 items' }));
    expect(onOpenCart).toHaveBeenCalledOnce();
  });

  it('preserves the compact header without adding the mobile introduction', () => {
    render(<Header compact showInstallPrompt={false} />);
    expect(screen.getByRole('img', { name: /Luvia/ }).getAttribute('sizes')).toBe('48px');
    expect(screen.getByText('Luvia Creations')).toBeTruthy();
    expect(screen.queryByText(/Discover thoughtfully crafted crochet accessories/)).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });

  it('uses a small left-aligned product-page logo on mobile and desktop', () => {
    render(<Header compact alignLogoLeft showHeading={false} showInstallPrompt={false}
      onOpenCart={vi.fn()} />);
    const logo = screen.getByRole('img', { name: /Luvia/ });
    const row = logo.parentElement?.parentElement?.parentElement;
    expect(row?.className).toContain('flex-row justify-start');
    expect(row?.className).toContain('items-center');
    expect(row?.className).toContain('text-left sm:pr-44 sm:justify-start');
    expect(logo.className).toContain('h-12 w-12');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open cart with 0 items' })).toBeTruthy();
  });
  it('left-aligns compact mobile branding even without a cart', () => {
    render(<Header compact alignLogoLeft showHeading={false} showInstallPrompt={false} />);
    const logo = screen.getByRole('img', { name: /Luvia/ });
    const row = logo.parentElement?.parentElement?.parentElement;
    expect(row?.className).toContain('flex-row justify-start');
    expect(row?.className).toContain('items-center');
    expect(row?.className).toContain('sm:justify-start');
  });
});
