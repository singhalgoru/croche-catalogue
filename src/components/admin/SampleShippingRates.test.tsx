import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SampleShippingRates from './SampleShippingRates';
import { compareSampleShippingRates } from '../../services/orderShipping';

vi.mock('../../services/orderShipping',() => ({ compareSampleShippingRates: vi.fn() }));
afterEach(cleanup);

it('compares all sample courier rates and surfaces an individual provider failure',async () => {
  vi.mocked(compareSampleShippingRates).mockResolvedValueOnce([
    { provider: 'shiprocket',quotes: [
      { id: 1,name: 'Courier A',charge: 80,days: 3,recommended: true },
      { id: 2,name: 'Courier B',charge: 100,days: null,recommended: false },
    ],error: null },
    { provider: 'delhivery',quotes: [],error: 'Unavailable' },
  ]);
  render(<SampleShippingRates />);
  fireEvent.click(screen.getByText('Compare sample shipping rates'));
  for (const [label,value] of [['Delivery pincode','110001'],['Packed weight (kg)','0.5'],['Length (cm)','20'],
    ['Width (cm)','15'],['Height (cm)','10']]) fireEvent.change(screen.getByLabelText(label),{ target: { value } });
  fireEvent.click(screen.getByRole('button',{ name: 'Compare rates' }));
  await screen.findByText(/Courier A/);
  expect(screen.getByText(/Courier B/)).toBeTruthy();
  expect(screen.getByText(/Rates unavailable: Unavailable/)).toBeTruthy();
  expect(compareSampleShippingRates).toHaveBeenCalledWith('110001',{ weight: 0.5,length: 20,breadth: 15,height: 10 });
  fireEvent.change(screen.getByLabelText('Delivery pincode'),{ target: { value: '110002' } });
  expect(screen.queryByText(/Courier A/)).toBeNull();
});
