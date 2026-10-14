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

it('groups category and suggested price choices under one compact filter control', () => {
  const onApplyPriceRange = vi.fn();
  const onSelectCategory = vi.fn();
  render(<MobileCatalogueFilters activeCategory="All" activePriceRange={null}
    categories={['Decor', 'Toys']} priceBands={bands}
    onApplyPriceRange={onApplyPriceRange} onSelectCategory={onSelectCategory} />);

  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  expect(screen.getByRole('region', { name: 'Catalogue filters' })).toBeTruthy();
  const grid = screen.getByRole('button', { name: 'Up to ₹250' }).parentElement!;
  expect(grid.className).toContain('grid-cols-2');
  fireEvent.click(screen.getByRole('button', { name: 'Toys' }));
  fireEvent.click(screen.getByRole('button', { name: '₹251–₹450' }));
  expect(onSelectCategory).toHaveBeenCalledWith('Toys');
  expect(onApplyPriceRange).toHaveBeenCalledWith({ minimum: 251, maximum: 450 });
});

it('validates a custom price range and supports clearing both filters', () => {
  const onApplyPriceRange = vi.fn();
  const onSelectCategory = vi.fn();
  render(<MobileCatalogueFilters activeCategory="Toys" activePriceRange={bands[1]}
    categories={['Decor', 'Toys']} priceBands={bands}
    onApplyPriceRange={onApplyPriceRange} onSelectCategory={onSelectCategory} />);

  fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
  fireEvent.change(screen.getByLabelText('Minimum'), { target: { value: '500' } });
  fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '250' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply custom price' }));
  expect(screen.getByRole('alert').textContent).toContain('must not exceed');
  expect(onApplyPriceRange).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
  expect(onSelectCategory).toHaveBeenCalledWith('All');
  expect(onApplyPriceRange).toHaveBeenCalledWith(null);
});
