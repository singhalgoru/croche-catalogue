import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MobileCatalogueFilters from './MobileCatalogueFilters';

afterEach(cleanup);

const bands = [
  { minimum: 0, maximum: 250, label: 'Up to ₹250' },
  { minimum: 251, maximum: 450, label: '₹251–₹450' },
  { minimum: 451, maximum: 650, label: '₹451–₹650' },
  { minimum: 651, maximum: null, label: '₹651+' },
];
const priceBandsByCategory = new Map([
  ['All', bands],
  ['Decor', bands],
  ['Navratri Specials', bands],
  ['Toys', [{ minimum: 251, maximum: null, label: '₹251+' }]],
]);

it('groups category and suggested price choices under one compact filter control', () => {
  const onApplyPriceRange = vi.fn();
  const onSelectCategory = vi.fn();
  const onApplyFilters = vi.fn();
  render(<MobileCatalogueFilters activeCategory="All" activePriceRange={null}
    categories={['Decor', 'Navratri Specials', 'Toys']} seasonalCategories={['Navratri Specials']} priceBands={bands}
    priceBandsByCategory={priceBandsByCategory} onApplyFilters={onApplyFilters}
    onApplyPriceRange={onApplyPriceRange} onSelectCategory={onSelectCategory} />);

  const seasonal = screen.getByRole('button', { name: 'Navratri Specials' });
  const filter = screen.getByRole('button', { name: 'Filters' });
  expect(seasonal.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(seasonal.classList.contains('badge-glow')).toBe(true);
  expect(seasonal.classList.contains('bg-mustard')).toBe(true);
  fireEvent.click(seasonal);
  expect(onSelectCategory).toHaveBeenCalledWith('Navratri Specials');
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  const dialog = screen.getByRole('dialog', { name: 'Filter products' });
  expect(dialog.className).toContain('w-full');
  expect(screen.getByText('Scroll to see all 5 categories')).toBeTruthy();
  const grid = screen.getByRole('button', { name: 'Up to ₹250' }).parentElement!;
  expect(grid.className).toContain('grid-cols-2');
  fireEvent.click(screen.getByRole('button', { name: 'Toys' }));
  expect(onSelectCategory).toHaveBeenCalledTimes(1);
  expect(onApplyPriceRange).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '₹251+' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '₹251+' }));
  expect(screen.getByRole('dialog', { name: 'Filter products' })).toBeTruthy();
  expect(onApplyFilters).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Show results' }));
  expect(onApplyFilters).toHaveBeenCalledWith('Toys', { minimum: 251, maximum: null });
  expect(screen.getByRole('button', { name: 'Filters' }).getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('dialog', { name: 'Filter products' })).toBeNull();
});

it('opens a modal filter dialog and supports Escape dismissal', () => {
  render(<MobileCatalogueFilters activeCategory="All" activePriceRange={null}
    categories={['Toys']} priceBands={bands}
    priceBandsByCategory={priceBandsByCategory} onApplyFilters={vi.fn()}
    onApplyPriceRange={vi.fn()} onSelectCategory={vi.fn()} />);

  const trigger = screen.getByRole('button', { name: 'Filters' });
  fireEvent.click(trigger);
  expect(screen.getByRole('dialog', { name: 'Filter products' }).getAttribute('aria-modal')).toBe('true');
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Filter products' })).toBeNull();
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.body.style.overflow).toBe('');
});

it('validates a custom price range and supports clearing both filters', () => {
  const onApplyPriceRange = vi.fn();
  const onSelectCategory = vi.fn();
  const onApplyFilters = vi.fn();
  render(<MobileCatalogueFilters activeCategory="Toys" activePriceRange={bands[1]}
    categories={['Decor', 'Toys']} priceBands={bands}
    priceBandsByCategory={priceBandsByCategory} onApplyFilters={onApplyFilters}
    onApplyPriceRange={onApplyPriceRange} onSelectCategory={onSelectCategory} />);

  fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
  fireEvent.change(screen.getByLabelText('Minimum'), { target: { value: '500' } });
  fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '250' } });
  fireEvent.click(screen.getByRole('button', { name: 'Show results' }));
  expect(screen.getByRole('alert').textContent).toContain('must not exceed');
  expect(screen.getByRole('dialog', { name: 'Filter products' })).toBeTruthy();
  expect(onApplyFilters).not.toHaveBeenCalled();
  expect(onApplyPriceRange).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
  expect(screen.getByRole('button', { name: 'All', pressed: true })).toBeTruthy();
  expect(onSelectCategory).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Show results' }));
  expect(onApplyFilters).toHaveBeenCalledWith('All', null);
});

it('shows active category and price filters in the horizontal bar with individual clear actions', () => {
  const onApplyPriceRange = vi.fn();
  const onSelectCategory = vi.fn();
  const onApplyFilters = vi.fn();
  render(<MobileCatalogueFilters activeCategory="Toys" activePriceRange={bands[1]}
    categories={['Decor', 'Toys']} priceBands={bands}
    priceBandsByCategory={priceBandsByCategory} onApplyFilters={onApplyFilters}
    onApplyPriceRange={onApplyPriceRange} onSelectCategory={onSelectCategory} />);

  expect(screen.getByRole('button', { name: 'Clear category filter: Toys' }).textContent)
    .toContain('Category: Toys');
  expect(screen.getByRole('button', { name: 'Clear price filter: ₹251–₹450' }).textContent)
    .toContain('Price: ₹251–₹450');
  fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
  expect(onSelectCategory).toHaveBeenCalledWith('All');
  expect(onApplyPriceRange).toHaveBeenCalledWith(null);
  fireEvent.click(screen.getByRole('button', { name: 'Clear category filter: Toys' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear price filter: ₹251–₹450' }));
  expect(onSelectCategory).toHaveBeenCalledTimes(2);
  expect(onApplyPriceRange).toHaveBeenCalledTimes(2);
});
