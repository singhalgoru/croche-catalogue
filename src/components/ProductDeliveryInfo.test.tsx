import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import ProductDeliveryInfo from './ProductDeliveryInfo';

afterEach(cleanup);
it('separates preparation from transit and links to existing policies', () => {
  render(<ProductDeliveryInfo />);
  expect(screen.getByText(/Courier delivery estimates start after dispatch/)).toBeTruthy();
  expect(screen.getByText(/defective, damaged or incorrect items only, not change of mind/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Full return and refund policy' }).getAttribute('href')).toBe('/return-policy/');
  expect(screen.getByRole('link', { name: 'Delivery FAQ' }).getAttribute('href')).toBe('/faq/');
});
