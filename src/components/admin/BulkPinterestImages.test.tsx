import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedProduct } from '../../services/products';
import { getPinterestImage, savePinterestImage } from '../../services/pinterestImages';
import BulkPinterestImages from './BulkPinterestImages';

vi.mock('../../services/pinterestImages', () => ({
  getPinterestImage: vi.fn(),
  savePinterestImage: vi.fn(),
}));

const products: ManagedProduct[] = [{
  id: 'p1', name: 'Headband', category: 'Accessories', description: '', price: 100,
  inStock: true, color: '', image: '/headband.webp', imagePath: '', published: true,
  publishedAt: null, createdAt: '', variants: ['Pink', 'Blue'].map((name, index) => ({
    id: `variant-${index + 1}`, name, color: '', price: null, inStock: true, availableQuantity: 1,
    image: `/${name}.webp`, imagePath: '', gallery: [],
  })),
}];
const previous = { image_path: 'old', image_url: '/old.webp', revision: 'r1' };
const saved = { image_path: 'new', image_url: '/new.webp', revision: 'r2' };

beforeEach(() => {
  vi.mocked(getPinterestImage).mockResolvedValue(null);
  vi.mocked(savePinterestImage).mockResolvedValue(saved);
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

function open() {
  const onBusyChange = vi.fn();
  render(<BulkPinterestImages products={products} shownProducts={products} disabled={false} onBusyChange={onBusyChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Bulk Pinterest photos and prompts' }));
  return onBusyChange;
}

describe('bulk Pinterest photos', () => {
  it('generates and copies variant-specific prompts with source links', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Select all shown variants' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate selected prompts' }));
    expect(screen.getByLabelText('Prompt for Headband - Pink')).toHaveProperty('value', expect.stringContaining('Product variant: Pink.'));
    expect(screen.getByLabelText('Prompt for Headband - Blue')).toHaveProperty('value', expect.stringContaining('Product variant: Blue.'));
    expect(screen.getAllByRole('link', { name: 'Open website photo' })[0].getAttribute('href')).toBe('/Pink.webp');
    fireEvent.click(screen.getByRole('button', { name: 'Copy all prompts' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringMatching(/Headband - Pink[\s\S]*Product variant: Pink\.[\s\S]*Headband - Blue[\s\S]*Product variant: Blue\./),
    ));
  });

  it('matches filenames, saves independently with revisions, and keeps failures for retry', async () => {
    const onBusyChange = open();
    vi.mocked(getPinterestImage).mockResolvedValueOnce(previous).mockRejectedValueOnce(new Error('Load failed'));
    const pink = new File(['pink'], 'Headband - Pink - variant-1.jpg', { type: 'image/jpeg' });
    const blue = new File(['blue'], 'unknown.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Choose Pinterest photos'), { target: { files: [pink, blue] } });
    expect(screen.getByLabelText('Product variant for Headband - Pink - variant-1.jpg')).toHaveProperty('value', 'variant-1');
    fireEvent.change(screen.getByLabelText('Product variant for unknown.jpg'), { target: { value: 'variant-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 assigned Pinterest photos' }));
    await screen.findByText(/1 of 2 photos saved/);
    expect(savePinterestImage).toHaveBeenCalledWith('variant-1', pink, previous);
    expect(savePinterestImage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toContain('Load failed');
    expect(screen.queryByText('Headband - Pink - variant-1.jpg')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 assigned Pinterest photos' }));
    await screen.findByText(/1 of 1 photos saved/);
    expect(savePinterestImage).toHaveBeenLastCalledWith('variant-2', blue, null);
    expect(onBusyChange.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('blocks duplicate assignments and leaves unassigned files unsaved', async () => {
    open();
    const files = ['first.jpg', 'second.jpg', 'unassigned.jpg'].map(name => new File(['x'], name, { type: 'image/jpeg' }));
    fireEvent.change(screen.getByLabelText('Choose Pinterest photos'), { target: { files } });
    fireEvent.change(screen.getByLabelText('Product variant for first.jpg'), { target: { value: 'variant-1' } });
    fireEvent.change(screen.getByLabelText('Product variant for second.jpg'), { target: { value: 'variant-1' } });
    expect(screen.getByRole('button', { name: 'Save 2 assigned Pinterest photos' })).toHaveProperty('disabled', true);
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Product variant for second.jpg'), { target: { value: 'variant-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 assigned Pinterest photos' }));
    await screen.findByText(/2 of 2 photos saved/);
    expect(savePinterestImage).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Product variant for unassigned.jpg')).toHaveProperty('value', '');
  });
});
