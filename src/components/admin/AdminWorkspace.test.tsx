import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import AdminWorkspace from './AdminWorkspace';

afterEach(cleanup);

it('shows only one workspace while preserving entries when switching sections', () => {
  render(<AdminWorkspace>{{
    Products: <input aria-label="Product draft" defaultValue="" />,
    Orders: <p>Cart orders</p>, Customers: <p>Registered customers</p>, Sales: <p>Monthly sales</p>, Snapshots: <p>Sales snapshots</p>, Settings: <p>Store settings</p>,
  }}</AdminWorkspace>);
  fireEvent.change(screen.getByLabelText('Product draft'), { target: { value: 'Rose' } });
  expect(screen.getByRole('region', { name: 'Products workspace' })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Sales workspace' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Customers' }));
  expect(screen.getByRole('region', { name: 'Customers workspace' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Sales' }));
  expect(screen.getByRole('region', { name: 'Sales workspace' })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Products workspace' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Snapshots' }));
  expect(screen.getByRole('region', { name: 'Snapshots workspace' })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Sales workspace' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Products' }));
  expect(screen.getByLabelText('Product draft')).toHaveProperty('value', 'Rose');
});
