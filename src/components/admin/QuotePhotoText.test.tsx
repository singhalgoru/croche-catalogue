import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import QuotePhotoText from './QuotePhotoText';
import { extractPhotoQuote } from '../../services/photoQuoteOcr';

vi.mock('../../services/photoQuoteOcr', () => ({ extractPhotoQuote: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('requires review and explicit replacement before changing an existing quote', async () => {
  vi.mocked(extractPhotoQuote).mockResolvedValue('A beautiful handmade gift! Extra chat details.');
  const apply = vi.fn(); const busy = vi.fn();
  render(<QuotePhotoText hasQuote onApply={apply} onBusyChange={busy} />);
  fireEvent.click(screen.getByText('Extract quote from a photo'));
  fireEvent.change(screen.getByLabelText('Review image for text extraction'),
    { target: { files: [new File(['test'], 'review.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Extract text on this device' }));
  const text = await screen.findByLabelText('Review extracted text');
  expect(apply).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Use reviewed text as quote' })).toHaveProperty('disabled', true);
  fireEvent.change(text, { target: { value: 'A beautiful handmade gift!' } });
  fireEvent.click(screen.getByLabelText('Replace the existing quote with this reviewed text'));
  fireEvent.click(screen.getByRole('button', { name: 'Use reviewed text as quote' }));
  expect(apply).toHaveBeenCalledWith('A beautiful handmade gift!');
  expect(busy.mock.calls).toEqual([[true], [false]]);
});

it('surfaces extraction errors without changing the quote', async () => {
  vi.mocked(extractPhotoQuote).mockRejectedValue(new Error('No readable text found.'));
  const apply = vi.fn();
  render(<QuotePhotoText hasQuote={false} onApply={apply} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByText('Extract quote from a photo'));
  fireEvent.change(screen.getByLabelText('Review image for text extraction'),
    { target: { files: [new File(['test'], 'review.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Extract text on this device' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'No readable text found.');
  expect(apply).not.toHaveBeenCalled();
});
