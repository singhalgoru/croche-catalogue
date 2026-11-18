import { beforeEach, expect, it, vi } from 'vitest';
import { fetchPatternWorkspace, queuePatternEmail, removeProductPattern, uploadProductPattern, validatePatternFile } from './productPatterns';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({ rpc }) }));
beforeEach(() => vi.clearAllMocks());

it('uploads a private Word document with expected and retry-stable revisions', async () => {
  const file = new File([new Uint8Array([80, 75, 3, 4, ...Array(100).fill(0)])], 'Lotus.docx');
  rpc.mockResolvedValue({ data: 'revision' });
  const pdf = new File(['%PDF-1.7\n' + 'x'.repeat(120)], 'Lotus.pdf');
  await uploadProductPattern('product', 'old', 'revision', { word: file, pdf, warnings: [] }, 'hi');
  expect(rpc).toHaveBeenCalledWith('save_product_pattern', expect.objectContaining({
    target_product: 'product', expected_revision: 'old', new_revision: 'revision', document_name: 'Lotus.docx',
    document_data: expect.stringMatching(/^UEsDB/),
    pdf_name: 'Lotus.pdf', pdf_data: expect.stringMatching(/^JVBERi0/), pattern_language: 'hi',
  }));
});
it('rejects unsupported, empty, oversized and disguised non-Word documents', async () => {
  for (const file of [new File([''], 'Empty.docx'), new File(['x'.repeat(100)], 'Macro.docm'),
    new File(['x'.repeat(2 * 1024 * 1024 + 1)], 'Large.docx'), new File(['x'.repeat(100)], '../unsafe.docx')]) {
    expect(() => validatePatternFile(file)).toThrow('editable .docx');
  }
  await expect(uploadProductPattern('p', null, 'r', { word: new File(['x'.repeat(100)], 'Fake.docx'),
    pdf: new File(['%PDF-' + 'x'.repeat(100)], 'Fake.pdf'), warnings: [] }, 'en')).rejects.toThrow('Invalid prepared');
  expect(rpc).not.toHaveBeenCalled();
});
it('loads pattern metadata, eligible recipients and history without fetching the document', async () => {
  const workspace = { pattern: { revision: 'r', filename: 'Lotus.docx', updated_at: 'date', size: 100,
    pdf_filename: 'Lotus.pdf', pdf_size: 200, language: 'en' },
    recipients: [{ id: 'a', name: 'Maker', email: 'maker@example.test' }], emails: [] };
  rpc.mockResolvedValue({ data: workspace });
  expect(await fetchPatternWorkspace('p')).toEqual(workspace);
  expect(rpc).toHaveBeenCalledWith('product_pattern_workspace', { target_product: 'p' });
  rpc.mockResolvedValue({ data: { ...workspace, emails: [{}] } });
  await expect(fetchPatternWorkspace('p')).rejects.toThrow('Invalid product pattern');
});
it('queues the exact reviewed revision and recipient with a stable request ID and validates receipts', async () => {
  rpc.mockResolvedValue({ data: 'request' });
  await queuePatternEmail('p', 'revision', 'artisan', 'request', 'Please review.');
  expect(rpc).toHaveBeenCalledWith('queue_product_pattern_email', {
    target_product: 'p', expected_revision: 'revision', artisan_id: 'artisan', request_id: 'request', artisan_message: 'Please review.',
  });
  rpc.mockResolvedValue({ data: 'wrong' });
  await expect(queuePatternEmail('p', 'r', 'a', 'request', '')).rejects.toThrow('could not be confirmed');
  await expect(removeProductPattern('p', 'r')).rejects.toThrow('could not be confirmed');
  rpc.mockResolvedValue({ error: { message: 'Verified admin access required' } });
  await expect(fetchPatternWorkspace('p')).rejects.toThrow('Verified admin');
});
