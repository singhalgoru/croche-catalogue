import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PriceFilter from './PriceFilter';

afterEach(cleanup);
const bands = [
  { minimum: 0, maximum: 250, label: 'Up to ₹250' },
  { minimum: 251, maximum: 450, label: '₹251–₹450' },
  { minimum: 451, maximum: 650, label: '₹451–₹650' },
  { minimum: 651, maximum: null, label: '₹651+' },
];

it('applies an inclusive minimum and maximum price range', () => {
  const onApply = vi.fn();
  render(<PriceFilter active={null} bands={bands} onApply={onApply} />);
  fireEvent.click(screen.getByText('Filter by price'));
  fireEvent.change(screen.getByLabelText('Minimum'), { target: { value: '200' } });
  fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '500' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(onApply).toHaveBeenCalledWith({ minimum: 200, maximum: 500 });
  expect(screen.getByText('Filter by price').closest('details')).toHaveProperty('open', false);
});

it('rejects inverted ranges and leaves the active filter unchanged', () => {
  const onApply = vi.fn();
  render(<PriceFilter active={{ minimum: 100, maximum: 500 }} bands={bands} onApply={onApply} />);
  fireEvent.click(screen.getByText(/Filter by price:/));
  fireEvent.change(screen.getByLabelText('Minimum'), { target: { value: '600' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.getByRole('alert').textContent).toContain('must not exceed');
  expect(onApply).not.toHaveBeenCalled();
});

it('clears the active range', () => {
  const onApply = vi.fn();
  render(<PriceFilter active={{ minimum: 100, maximum: null }} bands={bands} onApply={onApply} />);
  fireEvent.click(screen.getByRole('button', { name: 'Clear price filter' }));
  expect(onApply).toHaveBeenCalledWith(null);
});

it('offers a visible clear action beside an active desktop price filter', () => {
  const onApply = vi.fn();
  render(<PriceFilter active={{ minimum: 100, maximum: null }} bands={bands} onApply={onApply} />);
  expect(screen.getByRole('button', { name: 'Clear price filter' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear price filter' }));
  fireEvent.click(screen.getByText(/Filter by price:/));
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(onApply).toHaveBeenCalledTimes(2);
});

it('offers the catalogue price bands in one horizontally scrollable row', () => {
  const onApply = vi.fn();
  render(<PriceFilter active={null} bands={bands} onApply={onApply} />);
  fireEvent.click(screen.getByText('Filter by price'));
  const rangeRow = screen.getByText('Up to ₹250').parentElement!;
  expect(rangeRow.className).toContain('flex');
  expect(rangeRow.className).toContain('overflow-x-auto');
  expect(rangeRow.className).toContain('snap-x');
  fireEvent.click(screen.getByRole('button', { name: '₹251–₹450' }));
  expect(onApply).toHaveBeenCalledWith({ minimum: 251, maximum: 450 });
});

it.each([
  [{ minimum: 0, maximum: 250 }, 'Up to ₹250'],
  [{ minimum: 651, maximum: null }, '₹651+'],
  [{ minimum: 200, maximum: 500 }, '₹200–₹500'],
  [{ minimum: null, maximum: 500 }, 'Up to ₹500'],
  [{ minimum: 500, maximum: 500 }, '₹500'],
])('keeps the active range visible in the closed mobile filter: %s', (active, label) => {
  render(<PriceFilter active={active} bands={bands} onApply={vi.fn()} />);
  const summary = screen.getByLabelText(`Filter by price: ${label}`);
  expect(summary.querySelector('.sm\\:hidden')?.textContent).toBe(label);
  expect(summary.closest('details')).toHaveProperty('open', false);
});
