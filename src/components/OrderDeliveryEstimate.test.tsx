import { cleanup,render,screen } from '@testing-library/react';
import { afterEach,expect,it } from 'vitest';
import OrderDeliveryEstimate from './OrderDeliveryEstimate';
import type { OrderFulfilment } from '../types/customer';
afterEach(cleanup);
const fulfilment: OrderFulfilment = { status: 'processing',courierName: '',trackingNumber: '',trackingUrl: '',updatedAt: null };
const estimate = { courierName: 'Shadowfax Surface',transitDays: 4,expectedDate: null,updatedAt: null };
it('explains provisional timing before courier booking',() => {
  render(<OrderDeliveryEstimate fulfilment={fulfilment} />);
  expect(screen.getByText(/provisional until a courier is booked/)).toBeTruthy();
});
it('shows selected courier days without inventing a date from booking day',() => {
  render(<OrderDeliveryEstimate fulfilment={{ ...fulfilment,deliveryEstimate: estimate }} />);
  expect(screen.getByText('Shadowfax Surface delivery estimate')).toBeTruthy();
  expect(screen.getByText('Estimated transit: about 4 days after courier pickup.')).toBeTruthy();
  expect(screen.getByText(/arrival date is not confirmed yet/)).toBeTruthy();
  expect(screen.queryByText(/Courier's expected delivery:/)).toBeNull();
});
it('prioritizes the latest courier expected date over the original transit quote',() => {
  render(<OrderDeliveryEstimate fulfilment={{ ...fulfilment,deliveryEstimate: { ...estimate,expectedDate: '2026-10-25' } }} />);
  expect(screen.getByText("Courier's expected delivery: 25 Oct 2026")).toBeTruthy();
  expect(screen.queryByText(/Estimated transit:/)).toBeNull();
  expect(screen.getByText(/updates the provisional checkout estimate/)).toBeTruthy();
});
it('handles missing estimates and rejects malformed dates without displaying Invalid Date',() => {
  render(<OrderDeliveryEstimate fulfilment={{ ...fulfilment,deliveryEstimate: {
    ...estimate,expectedDate: '2026-02-31',transitDays: null,
  } }} />);
  expect(screen.getByText("Waiting for the courier's delivery estimate.")).toBeTruthy();
  expect(screen.queryByText(/Invalid Date/)).toBeNull();
});
it('does not show a future delivery expectation on delivered orders',() => {
  render(<OrderDeliveryEstimate fulfilment={{ ...fulfilment,status: 'delivered',deliveryEstimate: estimate }} />);
  expect(screen.queryByRole('region')).toBeNull();
});
