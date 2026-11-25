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
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

it('reviews and saves a separate portrait for the selected variant', async () => {
  render(<PinterestVariantImage variantId="v1" variantName="Pink" />);
  fireEvent.click(screen.getByRole('button', { name: 'Pinterest photo' }));
  await waitFor(() => expect(getPinterestImage).toHaveBeenCalledWith('v1'));
  const chooser = screen.getByLabelText('Choose Pinterest photo for Pink');
  expect(chooser.closest('label')?.textContent).toContain('Browse image');
  expect(chooser.closest('label')?.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  const file = new File(['photo'], 'portrait.jpg', { type: 'image/jpeg' });
  fireEvent.change(chooser, { target: { files: [file] } });
  expect(screen.getByText('portrait.jpg')).toBeTruthy();
  expect(screen.getByText('Tap to choose a different image')).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Selected Pinterest photo for Pink' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save Pinterest photo' }));
  expect((await screen.findByRole('status')).textContent).toContain('feeds update');
  expect(savePinterestImage).toHaveBeenCalledWith('v1', file, null);
  expect(screen.queryByText('portrait.jpg')).toBeNull();
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

it('shows Pinterest branding and generates a variant-specific copyable portrait prompt', async () => {
  render(<PinterestVariantImage variantId="v1" variantName="Pink Grey Mix" />);
  const trigger = screen.getByRole('button', { name: 'Pinterest photo' });
  expect(trigger.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  expect(trigger.className).toContain('decoration-[#E60023]');
  fireEvent.click(trigger);
  await waitFor(() => expect(getPinterestImage).toHaveBeenCalledWith('v1'));
  expect(screen.getByRole('heading', { name: 'Pinterest photo' }).querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Generate Pinterest prompt' }));
  const prompt = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Pinterest image prompt for Pink Grey Mix' });
  expect(prompt.value).toContain('Product variant: Pink Grey Mix.');
  expect(prompt.value).toContain('Continue the background and any existing clothing naturally');
  expect(prompt.value).toContain('Keep the original photo, product, any person and pose');
  expect(prompt.value).toContain('one seamless photograph—no horizontal edge, strip, panel or blank area');
  expect(prompt.value).toContain('move it onto the bottom-right of the photograph, not into a separate section');
  expect(prompt.value).toContain('Do not duplicate or redesign the logo');
  expect(prompt.value).toContain('If it overlaps the product or person, leave it in place');
  expect(prompt.value).toContain('If there is no logo, do not add one');
  expect(prompt.value).not.toContain('create a realistic product photograph');
  expect(prompt.value).toContain('2:3 portrait');
  expect(prompt.value).toContain('1000 x 1500 pixels');
  fireEvent.click(screen.getByRole('button', { name: 'Copy Pinterest prompt' }));
  expect(await screen.findByRole('status')).toBeTruthy();
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(prompt.value);
});
