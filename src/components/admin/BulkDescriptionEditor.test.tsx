import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BulkDescriptionEditor from './BulkDescriptionEditor';
import { analyzeProductImage } from '../../services/productAnalysis';
import { bulkUpdateProductDescriptions, type ManagedProduct } from '../../services/products';

vi.mock('../../services/productAnalysis', () => ({ analyzeProductImage: vi.fn() }));
vi.mock('../../services/products', () => ({ bulkUpdateProductDescriptions: vi.fn() }));
const products: ManagedProduct[] = ['Bunny', 'Coaster'].map((name, index) => ({
  id: `p${index}`, name, category: 'Home', description: `${name} old description.`,
  seoDescription: `${name} old SEO.`, materials: 'Cotton', image: `https://images.luviacreations.com/products/admin/p${index}.webp`,
  price: 100, inStock: true, published: true, color: '#ffffff', variants: [],
  imagePath: 'image.webp', publishedAt: null, createdAt: '2026-10-05',
}));
const suggestion = {
  name: 'Ignored name', category: 'Home', description: 'Fresh confirmed product description.',
  seoDescription: 'Fresh confirmed SEO summary.', color: '#ffffff',
};

beforeEach(() => {
  vi.mocked(analyzeProductImage).mockResolvedValue(suggestion);
  vi.mocked(bulkUpdateProductDescriptions).mockImplementation(async changes => changes.length);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, blob: async () => new Blob(['photo'], { type: 'image/webp' }),
  }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function open(props: Partial<React.ComponentProps<typeof BulkDescriptionEditor>> = {}) {
  const onSaved = vi.fn().mockResolvedValue(undefined);
  render(<BulkDescriptionEditor products={products} categories={['Home']} disabled={false}
    onBusyChange={vi.fn()} onSaved={onSaved} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Bulk descriptions with Gemini' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select all shown' }));
  return { onSaved };
}

describe('bulk description editing', () => {
  it('keeps the bulk section clickable while showing why generation is unavailable', () => {
    render(<BulkDescriptionEditor products={products} categories={['Home']} disabled
      disabledReason="Save or cancel the open product edit first."
      onBusyChange={vi.fn()} onSaved={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Bulk descriptions with Gemini' });
    expect(button).toHaveProperty('disabled', false);
    expect(button.className).toContain('hover:underline');
    expect(button.className).toContain('focus-visible:underline');
    fireEvent.click(button);
    expect(screen.getByRole('status').textContent).toBe('Save or cancel the open product edit first.');
    expect(screen.getByRole('button', { name: 'Select all shown' }).closest('fieldset')).toHaveProperty('disabled', true);
  });
  it('generates once for all selected products, allows edits, then atomically saves only copy', async () => {
    const { onSaved } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Generate selected descriptions' }));
    await screen.findByText(/Generation complete/);
    expect(analyzeProductImage).toHaveBeenCalledTimes(2);
    expect(analyzeProductImage).toHaveBeenCalledWith(expect.any(File), ['Home'], expect.objectContaining({
      name: 'Bunny', description: 'Bunny old description.', materials: 'Cotton',
    }), 'descriptions');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('-w960.webp'), { mode: 'cors', cache: 'reload' });
    expect(bulkUpdateProductDescriptions).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Description for Bunny'), { target: { value: 'Reviewed bunny copy.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save all approved changes' }));
    await screen.findByText('2 products saved. Descriptions and SEO summaries only.');
    expect(bulkUpdateProductDescriptions).toHaveBeenCalledWith(products.map((product, index) => ({
      id: product.id, originalDescription: product.description, originalSeoDescription: product.seoDescription,
      description: index === 0 ? 'Reviewed bunny copy.' : suggestion.description, seoDescription: suggestion.seoDescription,
    })));
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('reports individual generation failures and saves only approved successes', async () => {
    vi.mocked(analyzeProductImage).mockRejectedValueOnce(new Error('Gemini rate limit.'));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Generate selected descriptions' }));
    await screen.findByText(/Generation complete/);
    expect(screen.getByRole('alert').textContent).toContain('Bunny: Gemini rate limit.');
    expect(screen.queryByLabelText('Description for Bunny')).toBeNull();
    fireEvent.click(screen.getByLabelText('Save Coaster'));
    expect(screen.getByRole('button', { name: 'Save all approved changes' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByLabelText('Save Coaster'));
    fireEvent.click(screen.getByRole('button', { name: 'Save all approved changes' }));
    await screen.findByText('1 products saved. Descriptions and SEO summaries only.');
    expect(vi.mocked(bulkUpdateProductDescriptions).mock.calls[0][0].map(change => change.id)).toEqual(['p1']);
  });

  it('retains review edits on an atomic-save conflict and allows discarding without saving', async () => {
    vi.mocked(bulkUpdateProductDescriptions).mockRejectedValue(new Error('Products changed; no changes saved.'));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Generate selected descriptions' }));
    await screen.findByText(/Generation complete/);
    fireEvent.click(screen.getByRole('button', { name: 'Save all approved changes' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Products changed');
    expect(screen.getByLabelText('Description for Bunny')).toHaveProperty('value', suggestion.description);
    fireEvent.click(screen.getByRole('button', { name: 'Discard suggestions' }));
    expect(screen.queryByLabelText('Description for Bunny')).toBeNull();
    expect(bulkUpdateProductDescriptions).toHaveBeenCalledOnce();
  });

  it('retries only a failed product while preserving successful edits and approval choices', async () => {
    vi.mocked(analyzeProductImage).mockRejectedValueOnce(new Error('Gemini rate limit.'));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Generate selected descriptions' }));
    await screen.findByText(/Generation complete/);
    fireEvent.change(screen.getByLabelText('Description for Coaster'), { target: { value: 'Reviewed coaster copy.' } });
    fireEvent.change(screen.getByLabelText('SEO description for Coaster'), { target: { value: 'Reviewed coaster SEO.' } });
    fireEvent.click(screen.getByLabelText('Save Coaster'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry Bunny' }));
    await screen.findByLabelText('Description for Bunny');
    expect(screen.queryByRole('button', { name: 'Retry Bunny' })).toBeNull();
    expect(analyzeProductImage).toHaveBeenCalledTimes(3);
    expect(vi.mocked(analyzeProductImage).mock.calls[2][2]?.name).toBe('Bunny');
    expect(screen.getByLabelText('Description for Coaster')).toHaveProperty('value', 'Reviewed coaster copy.');
    expect(screen.getByLabelText('SEO description for Coaster')).toHaveProperty('value', 'Reviewed coaster SEO.');
    expect(screen.getByLabelText('Save Coaster')).toHaveProperty('checked', false);
    expect(bulkUpdateProductDescriptions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save all approved changes' }));
    await screen.findByText('1 products saved. Descriptions and SEO summaries only.');
    expect(vi.mocked(bulkUpdateProductDescriptions).mock.calls[0][0].map(change => change.id)).toEqual(['p0']);
  });

  it('keeps repeated failures retryable and stops a retry batch without losing pending failures', async () => {
    vi.mocked(analyzeProductImage)
      .mockRejectedValueOnce(new Error('First failure.'))
      .mockRejectedValueOnce(new Error('Second failure.'))
      .mockRejectedValueOnce(new Error('Still unavailable.'));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Generate selected descriptions' }));
    await screen.findByText(/Generation complete/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry Bunny' }));
    await screen.findByText('Bunny: Still unavailable.');
    expect(screen.getAllByRole('button', { name: 'Retry Bunny' })).toHaveLength(1);
    let resolve: (value: typeof suggestion) => void = () => {};
    vi.mocked(analyzeProductImage).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry all failed' }));
    await waitFor(() => expect(analyzeProductImage).toHaveBeenCalledTimes(4));
    expect(screen.getByRole('button', { name: 'Retry all failed' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Stop after current product' }));
    resolve(suggestion);
    await screen.findByText(/Generation stopped/);
    expect(screen.getByLabelText('Description for Coaster')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry Bunny' })).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByRole('button', { name: 'Retry all failed' }));
    await screen.findByLabelText('Description for Bunny');
    expect(screen.queryByRole('button', { name: 'Retry all failed' })).toBeNull();
    expect(analyzeProductImage).toHaveBeenCalledTimes(5);
    expect(bulkUpdateProductDescriptions).not.toHaveBeenCalled();
  });

  it('stops between products while preserving completed results', async () => {
    let resolve: (value: typeof suggestion) => void = () => {};
    vi.mocked(analyzeProductImage).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Generate selected descriptions' }));
    await waitFor(() => expect(analyzeProductImage).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Stop after current product' }));
    resolve(suggestion);
    await screen.findByText(/Generation stopped/);
    expect(analyzeProductImage).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Description for Bunny')).toBeTruthy();
    expect(bulkUpdateProductDescriptions).not.toHaveBeenCalled();
  });

  it('does not misreport a successful save when the subsequent refresh fails', async () => {
    open({ onSaved: vi.fn().mockRejectedValue(new Error('Network unavailable')) });
    fireEvent.click(screen.getByRole('button', { name: 'Generate selected descriptions' }));
    await screen.findByText(/Generation complete/);
    fireEvent.click(screen.getByRole('button', { name: 'Save all approved changes' }));
    await screen.findByText('2 products saved. Descriptions and SEO summaries only.');
    expect(screen.getByRole('alert').textContent).toContain('were saved, but refreshing failed');
    expect(screen.queryByLabelText('Description for Bunny')).toBeNull();
  });
});
