import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AdminWorkspace from './AdminWorkspace';

afterEach(cleanup);

it('shows only one workspace while preserving entries when switching sections', () => {
  render(<AdminWorkspace>{{
    Products: <input aria-label="Product draft" defaultValue="" />,
    'Customer Love': <p>Customer stories</p>,
    Orders: <p>Cart orders</p>, Customers: <p>Registered customers</p>, Artisans: <p>Artisan applications</p>, Sales: <p>Monthly sales</p>, Materials: <p>Material purchases</p>, 'Financial snapshots': <p>Sales snapshots</p>, Marketing: <p>Marketing overview</p>, Settings: <p>Store settings</p>,
  }}</AdminWorkspace>);
  fireEvent.change(screen.getByLabelText('Product draft'), { target: { value: 'Rose' } });
  expect(screen.getByRole('region', { name: 'Products workspace' })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Sales workspace' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Customers' }));
  expect(screen.getByRole('region', { name: 'Customers workspace' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Artisans' }));
  expect(screen.getByRole('region', { name: 'Artisans workspace' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Customer Love' }));
  expect(screen.getByRole('region', { name: 'Customer Love workspace' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Sales' }));
  expect(screen.getByRole('region', { name: 'Sales workspace' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Materials' }));
  expect(screen.getByRole('region', { name: 'Materials workspace' })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Products workspace' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Financial snapshots' }));
  expect(screen.getByRole('region', { name: 'Financial snapshots workspace' })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Sales workspace' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Marketing' }));
  expect(screen.getByRole('region', { name: 'Marketing workspace' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Products' }));
  expect(screen.getByLabelText('Product draft')).toHaveProperty('value', 'Rose');
});

it('provides a touch-friendly mobile section picker and notifies the workspace owner', () => {
  const onSectionChange = vi.fn();
  render(<AdminWorkspace onSectionChange={onSectionChange}>{{
    Products: <p>Product tools</p>,
    'Customer Love': <p>Customer stories</p>,
    Orders: <p>Cart orders</p>, Customers: <p>Registered customers</p>, Artisans: <p>Artisan applications</p>, Sales: <p>Monthly sales</p>, Materials: <p>Material purchases</p>, 'Financial snapshots': <p>Sales snapshots</p>, Marketing: <p>Marketing overview</p>, Settings: <p>Store settings</p>,
  }}</AdminWorkspace>);
  const picker = screen.getByRole('combobox', { name: 'Jump to admin section' });
  expect(picker.className).toContain('min-h-12');
  fireEvent.change(picker, { target: { value: 'Marketing' } });
  expect(onSectionChange).toHaveBeenCalledWith('Marketing');
  expect(screen.getByRole('region', { name: 'Marketing workspace' })).toBeTruthy();
});
