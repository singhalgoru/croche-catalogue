import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CategoryShareButton from './CategoryShareButton';

const getShareableImageFile = vi.hoisted(() => vi.fn());
vi.mock('../utils/categoryShareImage', () => ({ getCategoryShareImageFile: getShareableImageFile }));
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
    await act(async () => { render(<CategoryShareButton category="Navratri Specials" imageUrl="https://images.luviacreations.com/products/admin/navratri.webp" />); });
    await screen.findByRole('button', { name: 'Share Navratri Specials collection' });
    expect(getShareableImageFile).toHaveBeenCalledWith('https://images.luviacreations.com/products/admin/navratri.webp', 'navratri-specials', []);
    fireEvent.click(screen.getByRole('button', { name: 'Share Navratri Specials collection' }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      url: `${window.location.origin}/collections/navratri-specials/`,
      files: [file],
    }));
  });

  it('shares subtle hotspots with the collection link in the photo caption', async () => {
    const file = new File(['webp'], 'look.webp', { type: 'image/webp' });
    getShareableImageFile.mockResolvedValue(file);
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: () => true });
    const spots = [{ productId: 'rose', x: 25, y: 60 }];
    await act(async () => { render(<CategoryShareButton category="Decor" imageUrl="/look.webp" hotspots={spots} />); });
    fireEvent.click(screen.getByRole('button'));
    expect(getShareableImageFile).toHaveBeenCalledWith('/look.webp', 'decor', spots);
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      files: [file], text: expect.stringContaining(`small rings and explore the products.\n${window.location.origin}/collections/decor/`),
    }));
  });

  it('never attaches the previous image while a changed cover or hotspot layout is preparing', async () => {
    const old = new File(['old'], 'old.jpg', { type: 'image/jpeg' });
    getShareableImageFile.mockResolvedValueOnce(old).mockImplementationOnce(() => new Promise(() => {}));
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: () => true });
    let result: ReturnType<typeof render>;
    await act(async () => { result = render(<CategoryShareButton category="Decor" imageUrl="/old.webp" />); });
    result!.rerender(<CategoryShareButton category="Decor" imageUrl="/new.webp" />);
    fireEvent.click(screen.getByRole('button'));
    expect(share).toHaveBeenCalledWith(expect.not.objectContaining({ files: expect.anything() }));
    expect(screen.getByRole('alert').textContent).toContain('without a photo');
  });

  it('reports photo preparation errors and still allows sharing the collection link', async () => {
    getShareableImageFile.mockRejectedValue(new Error('Unable to encode the hotspot share photo.'));
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    await act(async () => { render(<CategoryShareButton category="Decor" imageUrl="/broken.webp" />); });
    fireEvent.click(screen.getByRole('button'));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: `${window.location.origin}/collections/decor/` }));
    expect(screen.getByRole('alert').textContent).toContain('Unable to encode');
  });
});
