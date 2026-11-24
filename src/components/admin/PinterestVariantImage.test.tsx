import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PinterestVariantImage from './PinterestVariantImage';
import { getPinterestImage, removePinterestImage, savePinterestImage } from '../../services/pinterestImages';

vi.mock('../../services/pinterestImages', () => ({
  getPinterestImage: vi.fn(),
  removePinterestImage: vi.fn(),
  savePinterestImage: vi.fn(),
}));

const saved = { image_path: 'r2:products/test/photo', image_url: 'https://images.luviacreations.com/products/test/photo.webp', revision: 'r1' };
beforeEach(() => {
  vi.mocked(getPinterestImage).mockResolvedValue(null);
  vi.mocked(savePinterestImage).mockResolvedValue(saved);
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:portrait'), revokeObjectURL: vi.fn() });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

it('reviews and saves a separate portrait for the selected variant', async () => {
  render(<PinterestVariantImage variantId="v1" variantName="Pink" />);
  fireEvent.click(screen.getByRole('button', { name: 'Pinterest photo' }));
  await waitFor(() => expect(getPinterestImage).toHaveBeenCalledWith('v1'));
  const file = new File(['photo'], 'portrait.jpg', { type: 'image/jpeg' });
  fireEvent.change(screen.getByLabelText('Choose Pinterest photo for Pink'), { target: { files: [file] } });
  expect(screen.getByRole('img', { name: 'Selected Pinterest photo for Pink' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save Pinterest photo' }));
  expect((await screen.findByRole('status')).textContent).toContain('feeds update');
  expect(savePinterestImage).toHaveBeenCalledWith('v1', file, null);
  expect(screen.getByRole('img', { name: 'Saved Pinterest photo for Pink' }).getAttribute('src')).toBe(saved.image_url);
  fireEvent.click(screen.getByRole('button', { name: 'Remove Pinterest photo' }));
  await waitFor(() => expect(removePinterestImage).toHaveBeenCalledWith('v1', saved));
  expect(await screen.findByText(/feeds will use the standard image/)).toBeTruthy();
});

it('prevents saving if the current portrait cannot be loaded', async () => {
  vi.mocked(getPinterestImage).mockRejectedValue(new Error('Load failed'));
  render(<PinterestVariantImage variantId="v1" variantName="Pink" />);
  fireEvent.click(screen.getByRole('button', { name: 'Pinterest photo' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Load failed');
  fireEvent.change(screen.getByLabelText('Choose Pinterest photo for Pink'), { target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] } });
  expect(screen.getByRole('button', { name: 'Save Pinterest photo' })).toHaveProperty('disabled', true);
});
