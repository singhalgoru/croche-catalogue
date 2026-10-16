import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CategoryHotspotEditor from './CategoryHotspotEditor';
import { products } from '../../data/products';
const product = { ...products[0], id: 'rose', name: 'Rose' };
afterEach(cleanup);

it('places markers in percentages and allows searching for the linked product', () => {
  const onChange = vi.fn();
  render(<CategoryHotspotEditor image="/photo.webp" products={[product]} hotspots={[]} onChange={onChange} disabled={false} />);
  fireEvent.change(screen.getByLabelText('Search hotspot products'), { target: { value: 'rose' } });
  fireEvent.change(screen.getByLabelText('Product for new hotspot'), { target: { value: 'rose' } });
  fireEvent.click(screen.getByRole('button', { name: 'Place new hotspot on photo' }));
  const imageButton = screen.getByRole('button', { name: 'Place hotspot on collection image' });
  vi.spyOn(imageButton, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 400, 200));
  fireEvent.click(imageButton, { clientX: 110, clientY: 170 });
  expect(onChange).toHaveBeenCalledWith([{ productId: 'rose', x: 25, y: 75 }]);
});

it('limits markers to six, exposes coordinate controls and supports removal', () => {
  const onChange = vi.fn();
  const spots = Array.from({ length: 6 }, (_, i) => ({ productId: 'rose', x: i, y: 50 }));
  render(<CategoryHotspotEditor image="/photo.webp" products={[product]} hotspots={spots} onChange={onChange} disabled={false} />);
  fireEvent.change(screen.getByLabelText('Product for new hotspot'), { target: { value: 'rose' } });
  expect(screen.getByRole('button', { name: 'Add at centre' })).toHaveProperty('disabled', true);
  fireEvent.change(screen.getByLabelText('Horizontal % for hotspot 1'), { target: { value: '20' } });
  expect(onChange.mock.calls[0][0][0].x).toBe(20);
  fireEvent.click(screen.getByRole('button', { name: 'Remove hotspot 1' }));
  expect(onChange.mock.calls[1][0]).toHaveLength(5);
});
