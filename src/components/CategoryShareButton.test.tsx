import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CategoryShareButton from './CategoryShareButton';

const getShareableImageFile = vi.hoisted(() => vi.fn());
vi.mock('../utils/shareImage', () => ({
  getShareableImageFile,
  toShareFileName: (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  getShareableImageFile.mockReset();
});

describe('CategoryShareButton', () => {
  it('shares a canonical seasonal collection link rather than the current filters', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    render(<CategoryShareButton category="Navratri Specials" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share Navratri Specials collection' }));
    expect(share).toHaveBeenCalledWith({
      title: 'Navratri Specials | Luvia Creations',
      text: 'Explore Navratri Specials from Luvia Creations.',
      url: `${window.location.origin}/collections/navratri-specials/`,
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('copies the link when native sharing is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CategoryShareButton category="Charms & Keychains" />);
    fireEvent.click(screen.getByRole('button'));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/collections/charms-keychains/`);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports unsupported sharing and clipboard failures', async () => {
    vi.stubGlobal('navigator', {});
    const { unmount } = render(<CategoryShareButton category="Toys" />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent',
      'Sharing is unavailable in this browser. Open the collection and copy its address to share.');
    unmount();
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
    render(<CategoryShareButton category="Toys" />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent',
      'Unable to share this collection. Open the collection and copy its address to share.');
  });

  it('does not report cancellation as a failure', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
    vi.stubGlobal('navigator', { share });
    render(<CategoryShareButton category="Toys" />);
    await fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports a native share failure', async () => {
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new Error('Denied')) });
    render(<CategoryShareButton category="Toys" />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent',
      'Unable to share this collection. Open the collection and copy its address to share.');
  });

  it('attaches the collection thumbnail when the browser can share files', async () => {
    const file = new File(['thumb'], 'navratri.webp', { type: 'image/webp' });
    getShareableImageFile.mockResolvedValue(file);
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn(() => true);
    vi.stubGlobal('navigator', { share, canShare, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<CategoryShareButton category="Navratri Specials" imageUrl="https://images.luviacreations.com/products/admin/navratri.webp" />);
    await screen.findByRole('button', { name: 'Share Navratri Specials collection' });
    expect(getShareableImageFile).toHaveBeenCalledWith('https://images.luviacreations.com/products/admin/navratri.webp', 'navratri-specials');
    fireEvent.click(screen.getByRole('button', { name: 'Share Navratri Specials collection' }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      url: `${window.location.origin}/collections/navratri-specials/`,
      files: [file],
    }));
  });
});
