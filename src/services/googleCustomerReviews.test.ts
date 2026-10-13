import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  calculateEstimatedDeliveryDate,
  GOOGLE_MERCHANT_ID,
  renderGoogleCustomerReviewsOptIn,
} from './googleCustomerReviews';

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.gapi;
  delete window.renderOptIn;
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('calculates an estimated delivery date formatted as YYYY-MM-DD', () => {
  const dateStr = calculateEstimatedDeliveryDate(5, 4);
  expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it('renders Google Customer Reviews opt-in when gapi is loaded', () => {
  const render = vi.fn();
  const load = vi.fn((_api: string, callback: () => void) => callback());
  window.gapi = {
    load,
    surveyoptin: { render },
  };

  renderGoogleCustomerReviewsOptIn({
    orderId: 'ORDER-1234',
    email: 'customer@example.com',
    estimatedDeliveryDate: '2026-10-25',
  });

  expect(load).toHaveBeenCalledWith('surveyoptin', expect.any(Function));
  expect(render).toHaveBeenCalledWith({
    merchant_id: GOOGLE_MERCHANT_ID,
    order_id: 'ORDER-1234',
    email: 'customer@example.com',
    delivery_country: 'IN',
    estimated_delivery_date: '2026-10-25',
  });
});

it('injects platform.js script if gapi is not yet available and defines window.renderOptIn', () => {
  renderGoogleCustomerReviewsOptIn({
    orderId: 'ORDER-5678',
    email: 'test@example.com',
    estimatedDeliveryDate: '2026-10-30',
  });

  expect(typeof window.renderOptIn).toBe('function');
  const script = document.querySelector('script[src*="apis.google.com/js/platform.js"]');
  expect(script).not.toBeNull();
});
