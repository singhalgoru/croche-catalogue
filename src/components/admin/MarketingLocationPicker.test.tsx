import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { searchMarketingLocations } = vi.hoisted(() => ({ searchMarketingLocations: vi.fn() }));
vi.mock('../../services/marketing', () => ({ searchMarketingLocations }));
import MarketingLocationPicker from './MarketingLocationPicker';

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
const mumbai = { key: 'city-1', type: 'city', label: 'Mumbai, Maharashtra, India' };
const pune = { key: 'city-2', type: 'city', label: 'Pune, Maharashtra, India' };

it('defaults to India and searches specific locations only when requested', async () => {
  const onChange = vi.fn();
  searchMarketingLocations.mockResolvedValue([mumbai, pune]);
  render(<MarketingLocationPicker disabled={false} onChange={onChange} />);
  expect(screen.getByLabelText<HTMLSelectElement>('Location coverage').value).toBe('country');
  expect(searchMarketingLocations).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Location coverage'), { target: { value: 'specific' } });
  expect(onChange).toHaveBeenLastCalledWith('', []);
  fireEvent.change(screen.getByLabelText('Location type'), { target: { value: 'city' } });
  fireEvent.change(screen.getByLabelText('Search Meta locations in India'), { target: { value: 'Mumbai' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search locations' }));
  fireEvent.click(await screen.findByRole('button', { name: `Add: ${mumbai.label}` }));
  fireEvent.click(screen.getByRole('button', { name: `Add: ${pune.label}` }));
  expect(searchMarketingLocations).toHaveBeenCalledWith('Mumbai', 'city');
  expect(onChange).toHaveBeenLastCalledWith(`${mumbai.label}; ${pune.label}`, [mumbai, pune]);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: `Selected: ${mumbai.label}` }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: `Remove ${mumbai.label}` }));
  expect(onChange).toHaveBeenLastCalledWith(pune.label, [pune]);
  fireEvent.change(screen.getByLabelText('Location coverage'), { target: { value: 'country' } });
  expect(onChange).toHaveBeenLastCalledWith('India', null);
});

it('shows lookup errors and permits retrying PIN-code searches', async () => {
  searchMarketingLocations.mockRejectedValueOnce(new Error('Reconnect Meta.'));
  render(<MarketingLocationPicker disabled={false} onChange={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Location coverage'), { target: { value: 'specific' } });
  fireEvent.change(screen.getByLabelText('Location type'), { target: { value: 'zip' } });
  fireEvent.change(screen.getByLabelText('Search Meta locations in India'), { target: { value: '400001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search locations' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Reconnect Meta.');
  searchMarketingLocations.mockResolvedValueOnce([]);
  fireEvent.click(screen.getByRole('button', { name: 'Search locations' }));
  expect(await screen.findByText(/No supported locations found/)).toBeTruthy();
  expect(searchMarketingLocations).toHaveBeenLastCalledWith('400001', 'zip');
});

it('ignores stale lookup results after the search changes and caps selection at five', async () => {
  let resolveSearch: (value: unknown) => void = () => { throw new Error('Search not started.'); };
  searchMarketingLocations.mockReturnValueOnce(new Promise(resolve => { resolveSearch = resolve; }));
  render(<MarketingLocationPicker disabled={false} onChange={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Location coverage'), { target: { value: 'specific' } });
  fireEvent.change(screen.getByLabelText('Search Meta locations in India'), { target: { value: 'Mah' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search locations' }));
  fireEvent.change(screen.getByLabelText('Search Meta locations in India'), { target: { value: 'Kar' } });
  resolveSearch([mumbai]);
  await waitFor(() => expect(screen.queryByRole('button', { name: `Add: ${mumbai.label}` })).toBeNull());
  const locations = Array.from({ length: 6 }, (_, index) => ({ key: `${index}`, type: 'region', label: `Region ${index}, India` }));
  searchMarketingLocations.mockResolvedValueOnce(locations);
  fireEvent.click(screen.getByRole('button', { name: 'Search locations' }));
  await screen.findByRole('button', { name: 'Add: Region 0, India' });
  locations.slice(0, 5).forEach(location => fireEvent.click(screen.getByRole('button', { name: `Add: ${location.label}` })));
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add: Region 5, India' }).disabled).toBe(true);
});
