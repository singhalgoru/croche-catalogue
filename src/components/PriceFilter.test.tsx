import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PriceFilter from './PriceFilter';

afterEach(cleanup);

it('applies an inclusive minimum and maximum price range', () => {
  const onApply = vi.fn();
  render(<PriceFilter active={null} onApply={onApply} />);
  fireEvent.click(screen.getByText('Filter by price'));
  fireEvent.change(screen.getByLabelText('Minimum'), { target: { value: '200' } });
  fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '500' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(onApply).toHaveBeenCalledWith({ minimum: 200, maximum: 500 });
  expect(screen.getByText('Filter by price').closest('details')).toHaveProperty('open', false);
});

it('rejects inverted ranges and leaves the active filter unchanged', () => {
  const onApply = vi.fn();
  render(<PriceFilter active={{ minimum: 100, maximum: 500 }} onApply={onApply} />);
  fireEvent.click(screen.getByText(/Filter by price:/));
  fireEvent.change(screen.getByLabelText('Minimum'), { target: { value: '600' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.getByRole('alert').textContent).toContain('must not exceed');
  expect(onApply).not.toHaveBeenCalled();
});

it('clears the active range', () => {
  const onApply = vi.fn();
  render(<PriceFilter active={{ minimum: 100, maximum: null }} onApply={onApply} />);
  fireEvent.click(screen.getByText(/Filter by price:/));
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(onApply).toHaveBeenCalledWith(null);
});
