import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductDetailsEditor from './ProductDetailsEditor';
import { analyzeProductImage } from '../../services/productAnalysis';

vi.mock('../../services/productAnalysis', () => ({ analyzeProductImage: vi.fn() }));
const value = {
  name: 'Existing coaster',
  category: 'Home',
  description: 'An existing handmade coaster description.',
  materials: '', dimensions: '', includedItems: '', careInstructions: '',
};
const suggestion = {
  name: 'Suggested coaster', category: 'Home', description: 'A revised description.',
  color: '#ffffff', materials: 'Cotton yarn', dimensions: '', includedItems: '', careInstructions: '',
};
const imageFile = new File(['photo'], 'coaster.webp', { type: 'image/webp' });

beforeEach(() => vi.mocked(analyzeProductImage).mockResolvedValue(suggestion));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ProductDetailsEditor', () => {
  it('sends confirmed notes and current facts, then waits for selective approval', async () => {
    const onChange = vi.fn();
    render(<ProductDetailsEditor value={value} categories={['Home']} imageFile={imageFile} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Confirmed facts for Gemini'), { target: { value: 'Cotton yarn. Size unknown.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest details from photo & notes' }));
    await screen.findByText('Review Gemini suggestions');
    expect(analyzeProductImage).toHaveBeenCalledWith(imageFile, ['Home'], { ...value, notes: 'Cotton yarn. Size unknown.' });
    expect(onChange).not.toHaveBeenCalled();
    const materialsCheckbox = screen.getAllByRole('checkbox').find(el => el.parentElement?.textContent?.includes('Materials'));
    expect(materialsCheckbox).toHaveProperty('checked', true);
    expect(screen.getAllByRole('checkbox')[0]).toHaveProperty('checked', false);
    fireEvent.click(screen.getByRole('button', { name: 'Apply selected suggestions' }));
    expect(onChange).toHaveBeenCalledWith({ materials: 'Cotton yarn' });
    expect(screen.getByRole('status').textContent).toContain('nothing has been published');
  });

  it('requires an explicit selection before replacing existing specifications', async () => {
    const onChange = vi.fn();
    render(<ProductDetailsEditor value={{ ...value, materials: 'Wool' }} categories={['Home']} imageFile={imageFile} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suggest details from photo & notes' }));
    await screen.findByText('Review Gemini suggestions');
    expect(screen.getByRole('button', { name: 'Apply selected suggestions' })).toHaveProperty('disabled', true);
    const current = screen.getByText('Current: Wool');
    const label = current.closest('label');
    if (!label) throw new Error('Missing suggestion review label');
    fireEvent.click(within(label).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply selected suggestions' }));
    expect(onChange).toHaveBeenCalledWith({ materials: 'Cotton yarn' });
  });

  it('shows failures and does not modify the draft', async () => {
    vi.mocked(analyzeProductImage).mockRejectedValueOnce(new Error('Gemini is unavailable.'));
    const onChange = vi.fn();
    const onBusyChange = vi.fn();
    render(<ProductDetailsEditor value={value} categories={['Home']} imageFile={imageFile} onChange={onChange} onBusyChange={onBusyChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suggest details from photo & notes' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Gemini is unavailable.');
    expect(onChange).not.toHaveBeenCalled();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('loads the existing product photo for editing and supports discarding suggestions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, blob: async () => new Blob(['photo'], { type: 'image/webp' }),
    }));
    const onChange = vi.fn();
    render(<ProductDetailsEditor value={value} categories={['Home']} imageUrl="https://images.luviacreations.com/photo.webp" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suggest details from photo & notes' }));
    await screen.findByText('Review Gemini suggestions');
    expect(fetch).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard suggestions' }));
    await waitFor(() => expect(screen.queryByText('Review Gemini suggestions')).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });
});
