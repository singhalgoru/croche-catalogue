import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProductPatternManager from './ProductPatternManager';
import { fetchPatternWorkspace, queuePatternEmail, uploadProductPattern } from '../../services/productPatterns';
import { preparePatternDocuments } from '../../services/patternDocuments';
vi.mock('../../services/patternDocuments', () => ({ preparePatternDocuments: vi.fn() }));
vi.mock('./AdminDialog', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../services/productPatterns', async original => ({
  ...await original<typeof import('../../services/productPatterns')>(),
  fetchPatternWorkspace: vi.fn(), queuePatternEmail: vi.fn(), uploadProductPattern: vi.fn(),
}));
const workspace = { pattern: { revision: 'r1', filename: 'Lotus.docx', updated_at: '2026-11-18', size: 1024,
  pdf_filename: 'Lotus.pdf', pdf_size: 2000, language: 'en' as const },
  recipients: [{ id: 'artisan', name: 'Maker', email: 'maker@example.test' }], emails: [] };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchPatternWorkspace).mockResolvedValue(workspace);
  vi.mocked(queuePatternEmail).mockResolvedValue();
  vi.mocked(uploadProductPattern).mockResolvedValue();
  vi.mocked(preparePatternDocuments).mockResolvedValue({ word: new File(['word'], 'Lotus.docx'),
    pdf: new File(['pdf'], 'Lotus.pdf'), warnings: [] });
});
afterEach(cleanup);
async function open() {
  render(<ProductPatternManager product={{ id: 'product', name: 'Lotus', image: '/lotus.jpg' }} />);
  expect(fetchPatternWorkspace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Artisan pattern' }));
  await screen.findByText('Lotus.docx');
}
it('requires recipient review and confirmation, keeps the request ID on a failed queue, and reports queued not delivered', async () => {
  vi.mocked(queuePatternEmail).mockRejectedValueOnce(new Error('Connection interrupted'));
  await open();
  const send = screen.getByRole('button', { name: 'Queue pattern email' });
  expect(send.matches(':disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Artisan'), { target: { value: 'artisan' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(send);
  await screen.findByText('Connection interrupted');
  fireEvent.click(send);
  await screen.findByText(/Pattern email queued/);
  const calls = vi.mocked(queuePatternEmail).mock.calls;
  expect(calls[0]).toEqual(calls[1]);
  expect(calls[0]).toEqual(['product', 'r1', 'artisan', expect.any(String), '']);
  expect(send.matches(':disabled')).toBe(true);
});
it('attaches a document without sending an email and resets confirmation when the message changes', async () => {
  await open();
  fireEvent.change(screen.getByLabelText('Artisan'), { target: { value: 'artisan' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Message to artisan (optional)'), { target: { value: 'New message' } });
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
  const file = new File(['x'.repeat(200)], 'Completed.docx');
  fireEvent.change(screen.getByLabelText('Choose Word pattern (.docx, up to 2 MB)'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Prepare and replace pattern documents' }));
  await waitFor(() => expect(uploadProductPattern).toHaveBeenCalledWith('product', 'r1', expect.any(String),
    expect.objectContaining({ word: expect.any(File), pdf: expect.any(File) }), 'en'));
  expect(queuePatternEmail).not.toHaveBeenCalled();
  await screen.findByText(/Word master and protected PDF saved privately/);
});
it('shows load failures with retry and does not show a false empty pattern', async () => {
  vi.mocked(fetchPatternWorkspace).mockRejectedValueOnce(new Error('Admin verification required'));
  render(<ProductPatternManager product={{ id: 'product', name: 'Lotus', image: '/lotus.jpg' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Artisan pattern' }));
  await screen.findByText('Admin verification required');
  expect(screen.queryByText('No pattern attached.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh pattern and email status' }));
  await screen.findByText('Lotus.docx');
});
it('clears reading progress and does not upload or email after a document preparation failure', async () => {
  vi.mocked(preparePatternDocuments).mockImplementationOnce(async (_product, _language, _input, onProgress) => {
    onProgress?.('Reading pattern instructions…');
    throw new Error('Unmerge vertically merged table cells before preparing the pattern.');
  });
  await open();
  fireEvent.change(screen.getByLabelText('Choose Word pattern (.docx, up to 2 MB)'), {
    target: { files: [new File(['x'.repeat(200)], 'Merged.docx')] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Prepare and replace pattern documents' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('alert').textContent).toContain('Unmerge vertically merged table cells');
  expect(screen.queryByText('Reading pattern instructions…')).toBeNull();
  expect(uploadProductPattern).not.toHaveBeenCalled();
  expect(queuePatternEmail).not.toHaveBeenCalled();
});
it('authors Hindi instructions in admin and prepares Hindi Word/PDF documents without sending email', async () => {
  await open();
  fireEvent.change(screen.getByLabelText('Document language'), { target: { value: 'hi' } });
  fireEvent.change(screen.getByLabelText('Pattern source'), { target: { value: 'write' } });
  fireEvent.change(screen.getByLabelText('पैटर्न के निर्देश (हिन्दी)'), { target: { value: 'R1: 5 चेन बनाएं।' } });
  fireEvent.click(screen.getByRole('button', { name: 'Prepare and replace pattern documents' }));
  await waitFor(() => expect(preparePatternDocuments).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Lotus' }), 'hi', 'R1: 5 चेन बनाएं।', expect.any(Function)));
  expect(queuePatternEmail).not.toHaveBeenCalled();
});
it('requires a new review after refreshing a replaced pattern', async () => {
  await open();
  fireEvent.change(screen.getByLabelText('Artisan'), { target: { value: 'artisan' } });
  fireEvent.click(screen.getByRole('checkbox'));
  vi.mocked(fetchPatternWorkspace).mockResolvedValue({ ...workspace,
    pattern: { ...workspace.pattern, revision: 'r2', filename: 'Lotus-v2.docx' } });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh pattern and email status' }));
  await screen.findByText('Lotus-v2.docx', { selector: 'p' });
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
  expect(screen.getByRole('button', { name: 'Queue pattern email' }).matches(':disabled')).toBe(true);
});
