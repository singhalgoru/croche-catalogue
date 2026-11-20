import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SampleShippingRates from './SampleShippingRates';
import { compareSampleShippingRates } from '../../services/orderShipping';
import { fetchManagedProducts } from '../../services/products';

vi.mock('../../services/orderShipping',() => ({ compareSampleShippingRates: vi.fn() }));
vi.mock('../../services/products',() => ({ fetchManagedProducts: vi.fn() }));
beforeEach(() => vi.mocked(fetchManagedProducts).mockResolvedValue([]));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('compares all sample courier rates and surfaces an individual provider failure',async () => {
  vi.mocked(compareSampleShippingRates).mockResolvedValueOnce([
    { provider: 'shiprocket',quotes: [
      { id: 1,name: 'Courier A',charge: 80,days: 3,recommended: true },
      { id: 2,name: 'Courier B',charge: 100,days: null,recommended: false },
    ],error: null },
    { provider: 'delhivery',quotes: [],error: 'Unavailable' },
    { provider: 'shadowfax',quotes: [{ id: 1,name: 'Shadowfax',charge: 81.42,days: null,recommended: false }],error: null },
  ]);
  render(<SampleShippingRates />);
  fireEvent.click(screen.getByText('Compare sample shipping rates'));
  for (const [label,value] of [['Delivery pincode','110001'],['Packed weight (kg)','0.5'],['Length (cm)','20'],
    ['Width (cm)','15'],['Height (cm)','10']]) fireEvent.change(screen.getByLabelText(label),{ target: { value } });
  fireEvent.click(screen.getByRole('button',{ name: 'Compare rates' }));
  await screen.findByText(/Courier A/);
  expect(screen.getByText(/Courier B/)).toBeTruthy();
  expect(screen.getByText(/Rates unavailable: Unavailable/)).toBeTruthy();
  expect(screen.getByText(/Shadowfax: ₹81/)).toBeTruthy();
  expect(compareSampleShippingRates).toHaveBeenCalledWith('110001',{ weight: 0.5,length: 20,breadth: 15,height: 10 });
  fireEvent.change(screen.getByLabelText('Delivery pincode'),{ target: { value: '110002' } });
  expect(screen.queryByText(/Courier A/)).toBeNull();
});

it('prefills guided packaging for selected products and requires a verified weight',async () => {
  vi.mocked(fetchManagedProducts).mockResolvedValue([
    { id: 'bunny',name: 'Bunny Toy' },
    { id: 'lotus',name: 'Lotus Flower Decor' },
    { id: 'anklet',name: 'Bell Anklet' },
    { id: 'unknown',name: 'Other product' },
  ] as Awaited<ReturnType<typeof fetchManagedProducts>>);
  vi.mocked(compareSampleShippingRates).mockResolvedValue([]);
  render(<SampleShippingRates />);
  fireEvent.click(screen.getByText('Compare sample shipping rates'));
  await screen.findByRole('option',{ name: 'Bunny Toy' });
  fireEvent.change(screen.getByLabelText('Sample product'),{ target: { value: 'bunny' } });
  fireEvent.click(screen.getByRole('button',{ name: 'Add product' }));
  expect((screen.getByLabelText('Packed weight (kg)') as HTMLInputElement).value).toBe('0.5');
  expect((screen.getByLabelText('Length (cm)') as HTMLInputElement).value).toBe('27');
  expect((screen.getByLabelText('Width (cm)') as HTMLInputElement).value).toBe('20');
  expect((screen.getByLabelText('Height (cm)') as HTMLInputElement).value).toBe('14');
  expect((screen.getByRole('button',{ name: 'Compare rates' }) as HTMLButtonElement).disabled).toBe(true);

  fireEvent.change(screen.getByLabelText('Sample product'),{ target: { value: 'lotus' } });
  fireEvent.click(screen.getByRole('button',{ name: 'Add product' }));
  fireEvent.change(screen.getByLabelText('Quantity for Lotus Flower Decor'),{ target: { value: '2' } });
  expect((screen.getByLabelText('Width (cm)') as HTMLInputElement).value).toBe('22');
  expect(screen.getByText(/Multiple items may need a larger box/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Delivery pincode'),{ target: { value: '110001' } });
  fireEvent.change(screen.getByLabelText('Packed weight (kg)'),{ target: { value: '1.5' } });
  fireEvent.click(screen.getByRole('button',{ name: 'Compare rates' }));
  expect(compareSampleShippingRates).toHaveBeenCalledWith('110001',{ weight: 1.5,length: 27,breadth: 22,height: 14 });

  fireEvent.change(screen.getByLabelText('Sample product'),{ target: { value: 'anklet' } });
  fireEvent.click(screen.getByRole('button',{ name: 'Add product' }));
  expect((screen.getByLabelText('Height (cm)') as HTMLInputElement).value).toBe('');
  expect(screen.getByText(/enter the packed height/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Sample product'),{ target: { value: 'unknown' } });
  fireEvent.click(screen.getByRole('button',{ name: 'Add product' }));
  expect((screen.getByLabelText('Length (cm)') as HTMLInputElement).value).toBe('');
  expect(screen.getByText(/No complete packaging suggestion/)).toBeTruthy();
});
