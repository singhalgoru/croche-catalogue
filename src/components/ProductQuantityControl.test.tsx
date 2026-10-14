import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ProductQuantityControl from './ProductQuantityControl';

afterEach(cleanup);

it('stops increases at available stock while keeping decrease and removal usable', () => {
  const increase = vi.fn();
  const decrease = vi.fn();
  const remove = vi.fn();
  const { rerender } = render(<ProductQuantityControl productName="Rose" quantity={3} maximumQuantity={3}
    onIncrease={increase} onDecrease={decrease} onRemove={remove} />);
  fireEvent.click(screen.getByRole('button', { name: 'Increase quantity of Rose' }));
  expect(increase).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity of Rose' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove Rose from cart' }));
  expect(decrease).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledOnce();
  rerender(<ProductQuantityControl productName="Rose" quantity={2} maximumQuantity={3}
    onIncrease={increase} onDecrease={decrease} onRemove={remove} />);
  fireEvent.click(screen.getByRole('button', { name: 'Increase quantity of Rose' }));
  expect(increase).toHaveBeenCalledOnce();
});
