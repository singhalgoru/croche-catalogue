import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ArtisanWorkAssignments from './ArtisanWorkAssignments';
import { mockNativeDialog } from './dialogTestSupport';

const { products, patterns, workspace, list, create, complete } = vi.hoisted(() => ({
  products: vi.fn(), patterns: vi.fn(), workspace: vi.fn(), list: vi.fn(), create: vi.fn(), complete: vi.fn(),
}));
vi.mock('../../services/products', () => ({ fetchManagedProducts: products }));
vi.mock('../../services/productPatterns', () => ({ fetchPatternProductIds: patterns, fetchPatternWorkspace: workspace }));
vi.mock('../../services/artisanWork', () => ({ listWorkAssignments: list, createWorkAssignment: create, completeWorkAssignment: complete }));
const artisan = { id: 'artisan', name: 'Maker', email: 'maker@example.test', approved: true };
const pattern = { revision: 'revision', pdf_filename: 'Headband.pdf' };
let restoreDialog: () => void;
beforeEach(() => {
  restoreDialog = mockNativeDialog();
  vi.clearAllMocks();
  products.mockResolvedValue([{ id: 'product', name: 'Headband', published: true }]);
  patterns.mockResolvedValue(new Set(['product']));
  workspace.mockResolvedValue({ pattern });
  list.mockResolvedValue([]);
  create.mockResolvedValue(undefined);
  complete.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); restoreDialog(); });

it('previews catalogue and manual products with selected pattern and retries the same assignment after uncertainty', async () => {
  create.mockRejectedValueOnce(new Error('Network failed'));
  render(<ArtisanWorkAssignments artisan={artisan} onClose={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText('Catalogue product or manual entry'), { target: { value: 'product' } });
  fireEvent.click(screen.getByLabelText('Attach available PDF pattern'));
  await screen.findByText('Attach Headband.pdf');
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Including yarn / unit (INR)'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Excluding yarn / unit (INR)'), { target: { value: '75' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
  const second = screen.getByRole('group', { name: 'Product 2' });
  fireEvent.change(within(second).getByLabelText('Product name'), { target: { value: 'Custom flower' } });
  fireEvent.change(within(second).getByLabelText('Quantity'), { target: { value: '3' } });
  fireEvent.change(within(second).getByLabelText('Including yarn / unit (INR)'), { target: { value: '50' } });
  fireEvent.change(within(second).getByLabelText('Excluding yarn / unit (INR)'), { target: { value: '25' } });
  fireEvent.change(screen.getByLabelText('Delivery date'), { target: { value: '2099-12-01' } });
  fireEvent.change(screen.getByLabelText('Maximum courier reimbursement (INR)'), { target: { value: '120' } });
  fireEvent.change(screen.getByLabelText('Email message'), { target: { value: 'Please make these.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview email' }));
  expect(screen.getByTitle('Assignment email preview').getAttribute('srcdoc')).toContain('Headband.pdf');
  expect(screen.getByTitle('Assignment email preview').getAttribute('srcdoc')).toContain('Please make these.');
  fireEvent.click(screen.getByRole('button', { name: 'Send assignment email' }));
  await screen.findByText('Network failed');
  expect((screen.getByRole('button', { name: 'Edit assignment' }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Retry same assignment' }));
  await screen.findByText(/Assignment email queued/);
  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
  expect(create.mock.calls[0]![2]).toMatchObject({ courierCap: 120, items: [
    { productId: 'product', quantity: 2, patternRevision: 'revision', rateWithYarn: 100, rateWithoutYarn: 75 },
    { productId: null, name: 'Custom flower', quantity: 3, patternRevision: null },
  ] });
});

it('requires confirmation to complete accepted work, including for no-longer-approved artisans', async () => {
  const entry = { id: 'work', offer: { items: [{ name: 'Headband', quantity: 2, rateWithYarn: 100, rateWithoutYarn: 75, patternFilename: null }],
    message: 'Please make it.', deliveryDate: '2099-12-01', courierCap: 120 },
  expiresAt: '2099-12-01', acceptedAt: '2026-01-01', completedAt: null, offerSentAt: '2026-01-01',
  offerError: null, offerAttempts: 1, confirmationSentAt: null, confirmationError: null, confirmationAttempts: 0 };
  list.mockResolvedValue([entry]);
  render(<ArtisanWorkAssignments artisan={{ ...artisan, approved: false }} onClose={vi.fn()} />);
  expect(await screen.findByText('Work in progress')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Preview email' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Mark work complete' }));
  expect(complete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm completion' }));
  await waitFor(() => expect(complete).toHaveBeenCalledWith('work'));
  expect(await screen.findByText('Assignment marked completed.')).toBeTruthy();
});
