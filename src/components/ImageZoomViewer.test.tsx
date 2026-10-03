import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ImageZoomViewer from './ImageZoomViewer';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const setup = (width = 400, height = 400) => {
  const onClose = vi.fn();
  const onNextImage = vi.fn();
  render(<ImageZoomViewer image="/photo.webp" alt="Rose" onClose={onClose}
    hasMultipleImages onNextImage={onNextImage} />);
  const image = screen.getByAltText('Rose');
  Object.defineProperties(image, {
    naturalWidth: { value: width },
    naturalHeight: { value: height },
  });
  vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: 400, bottom: 800, width: 400, height: 800,
    x: 0, y: 0, toJSON: () => ({}),
  });
  return { image, onClose, onNextImage, dialog: screen.getByRole('dialog') };
};

describe('zoom outside-image dismissal', () => {
  it('closes from letterboxing within the full-screen image element', () => {
    const { image, onClose } = setup();
    fireEvent.click(image, { clientX: 200, clientY: 100 });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps clicks within the visible image open and stops propagation', () => {
    const { image, onClose } = setup();
    fireEvent.click(image, { clientX: 200, clientY: 400 });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes from dialog whitespace but keeps navigation and zoom controls working', () => {
    const { dialog, onClose, onNextImage } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Show next zoomed product image' }));
    expect(onNextImage).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog, { clientX: 100, clientY: 20 });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('uses portrait letterboxing and transformed bounds, not the full img box', () => {
    const { image, onClose } = setup(200, 800);
    fireEvent.click(image, { clientX: 50, clientY: 400 });
    expect(onClose).toHaveBeenCalledOnce();
    onClose.mockClear();
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
      left: -200, top: -400, right: 600, bottom: 1200, width: 800, height: 1600,
      x: -200, y: -400, toJSON: () => ({}),
    });
    fireEvent.click(image, { clientX: 50, clientY: 400 });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not dismiss on the generated click after a drag, but accepts the next tap', () => {
    const { image, onClose } = setup();
    const surface = image.parentElement!;
    const pointer = { pointerId: 1, pointerType: 'touch' };
    fireEvent.pointerDown(surface, { ...pointer, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(surface, { ...pointer, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(surface, { ...pointer, clientX: 200, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(surface, { ...pointer, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(surface, { ...pointer, clientX: 200, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
