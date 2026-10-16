import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CategoryShareButton from './CategoryShareButton';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Collection shared.');
  });

  it('copies the link when native sharing is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CategoryShareButton category="Charms & Keychains" />);
    fireEvent.click(screen.getByRole('button'));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/collections/charms-keychains/`);
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Collection link copied!');
  });

  it('reports unsupported sharing and clipboard failures', async () => {
    vi.stubGlobal('navigator', {});
    const { unmount } = render(<CategoryShareButton category="Toys" />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('status')).toHaveProperty('textContent',
      'Sharing is unavailable in this browser. Open the collection and copy its address to share.');
    unmount();
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
    render(<CategoryShareButton category="Toys" />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('status')).toHaveProperty('textContent',
      'Unable to share this collection. Open the collection and copy its address to share.');
  });

  it('does not report cancellation as a failure', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
    vi.stubGlobal('navigator', { share });
    render(<CategoryShareButton category="Toys" />);
    await fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('reports a native share failure', async () => {
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new Error('Denied')) });
    render(<CategoryShareButton category="Toys" />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('status')).toHaveProperty('textContent',
      'Unable to share this collection. Open the collection and copy its address to share.');
  });
});
