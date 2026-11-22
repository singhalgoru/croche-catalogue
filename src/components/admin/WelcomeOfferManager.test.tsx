import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import WelcomeOfferManager from './WelcomeOfferManager';

vi.mock('../../services/customer', () => ({
  fetchWelcomeOffer: vi.fn().mockResolvedValue({ percent: 10, maxDiscountRupees: 100, minimumSubtotalRupees: 500, validDays: 30, enabled: true }),
  saveWelcomeOffer: vi.fn(),
}));
afterEach(cleanup);
it('starts collapsed and shows the existing offer when opened', async () => {
  render(<WelcomeOfferManager />);
  const summary = screen.getByText('First-order coupon — ILOVELUVIA');
  expect(summary.parentElement).toHaveProperty('open', false);
  fireEvent.click(summary);
  expect(summary.parentElement).toHaveProperty('open', true);
  expect(await screen.findByLabelText('Discount (%)')).toHaveProperty('value', '10');
});
