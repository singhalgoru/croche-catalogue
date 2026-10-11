import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import ProductDeliveryInfo from './ProductDeliveryInfo';

afterEach(cleanup);
it('uses a native collapsed disclosure containing the delivery text and policy links', () => {
  render(<ProductDeliveryInfo />);
  const section = screen.getByRole('region', { name: 'Delivery and returns' });
  const details = section.querySelector('details');
  expect(details?.open).toBe(false);
  expect(details?.querySelector('summary')?.textContent).toBe('Delivery and returns');
  expect(within(details!).getByText(/We ship across India/)).toBeTruthy();
  expect(details?.querySelectorAll('a')).toHaveLength(2);
});
it('separates preparation from transit and links to existing policies', () => {
  render(<ProductDeliveryInfo />);
  expect(screen.getByText(/Courier delivery estimates start after dispatch/)).toBeTruthy();
  expect(screen.getByText(/defective, damaged or incorrect items only, not change of mind/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Full return and refund policy' }).getAttribute('href')).toBe('/return-policy/');
  expect(screen.getByRole('link', { name: 'Delivery FAQ' }).getAttribute('href')).toBe('/faq/');
});
