import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SellerSalesDashboard from './SellerSalesDashboard';
import SalesSnapshotWorkspace from './SalesSnapshotWorkspace';
import type { SellerSale, SellerSaleInput } from '../../services/sellerSales';
import type { ManagedProduct } from '../../services/products';
import { createSellerSale, fetchSellerSales } from '../../services/sellerSales';
import { fetchManagedProducts } from '../../services/products';
import { fetchBusinessExpenses, saveBusinessExpense, deleteBusinessExpense } from '../../services/businessExpenses';

vi.mock('../../services/businessExpenses', () => ({
  EXPENSE_CATEGORIES: ['Advertising', 'Tools & equipment', 'Subscriptions', 'Rent & utilities', 'Travel', 'Other'],
  fetchBusinessExpenses: vi.fn(),
  saveBusinessExpense: vi.fn(),
  deleteBusinessExpense: vi.fn(),
}));

vi.mock('../../services/sellerSales', () => ({
  SALE_CHANNELS: ['online', 'offline', 'whatsapp', 'instagram', 'other'],
  createSellerSale: vi.fn(),
  deleteSellerSale: vi.fn(),
  fetchSellerSales: vi.fn(),
  updateSellerSale: vi.fn(),
}));
vi.mock('../../services/products', () => ({
  fetchManagedProducts: vi.fn(),
}));

const product: ManagedProduct = {
  id: 'product-1',
  name: 'Crochet flower',
  category: 'Decor',
  description: 'A handmade crochet flower.',
  price: 250,
  showPrice: true,
  minimumOrderQuantity: 1,
  profitMarginPercent: 45,
  gstPercent: 5,
  priceDiscoveryInputs: {
    timeSpent: '30',
    timeUnit: 'minutes',
    materialCost: '25',
    shippingCost: '60',
    packagingCost: '8',
    gstPercent: '5',
    targetMarginPercent: '45',
  },
  inStock: true,
  color: '#ffffff',
  image: '/flower.webp',
  imagePath: 'flower.webp',
  variants: [{
    id: 'variant-1',
    name: 'Pink',
    color: '#ffaaaa',
    price: null,
    inStock: true,
    availableQuantity: 20,
    image: '/flower.webp',
    imagePath: 'flower.webp',
    gallery: [],
  }],
  published: true,
  publishedAt: null,
  createdAt: '2026-10-01T00:00:00Z',
};

const sale: SellerSale = {
  id: 'sale-1',
  productId: product.id,
  productName: product.name,
  variantName: 'Pink',
  saleDate: '2026-10-06',
  channel: 'offline',
  quantity: 1,
  unitPrice: 250,
  gstPercent: 5,
  materialCost: 25,
  labourCost: 50,
  packagingCost: 8,
  shippingCost: 60,
  gatewayFeePercent: 0,
  gatewayFeeGstPercent: 18,
  notes: '',
  createdAt: '2026-10-06T10:00:00Z',
};

beforeEach(() => {
  vi.mocked(fetchBusinessExpenses).mockResolvedValue([]);
  vi.mocked(saveBusinessExpense).mockImplementation(async (input, id) => ({ ...input, id: id ?? 'expense-1' }));
  vi.mocked(deleteBusinessExpense).mockResolvedValue(undefined);
  vi.mocked(fetchSellerSales).mockResolvedValue([]);
  vi.mocked(fetchManagedProducts).mockResolvedValue([product]);
  vi.mocked(createSellerSale).mockImplementation(async (input: SellerSaleInput) => ({
    ...sale,
    ...input,
    id: 'created-sale',
    createdAt: '2026-10-06T10:00:00Z',
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SellerSalesDashboard', () => {
  it('keeps the annual snapshot independent of month selection and refreshes recorded data', async () => {
    vi.mocked(fetchSellerSales).mockResolvedValue([
      { ...sale, saleDate: '2025-03-31', unitPrice: 100, gstPercent: 0 },
      { ...sale, id: 'second', saleDate: '2025-04-01', unitPrice: 200, gstPercent: 0 },
    ]);
    render(<SalesSnapshotWorkspace refreshKey={1} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh snapshots' })).toHaveProperty('disabled', false));
    fireEvent.change(screen.getByLabelText('Snapshot year'), { target: { value: '2025' } });
    const yearCard = () => within(screen.getByRole('article', { name: 'Year 2025 · Jan–Dec' }));
    expect(yearCard().getByText('₹300')).toBeTruthy();
    expect(within(screen.getByRole('article', { name: 'Q1 · Jan–Mar 2025' })).getByText('₹100')).toBeTruthy();
    expect(within(screen.getByRole('article', { name: 'Q2 · Apr–Jun 2025' })).getByText('₹200')).toBeTruthy();
    expect(screen.queryByLabelText('Sales month')).toBeNull();
    expect(yearCard().getByText('₹300')).toBeTruthy();
    vi.mocked(fetchBusinessExpenses).mockResolvedValue([{
      id: 'expense', description: 'Ads', expenseDate: '2025-04-01', category: 'Advertising', amount: 10, notes: '',
    }]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh snapshots' }));
    await waitFor(() => expect(yearCard().getByText('₹10')).toBeTruthy());
  });

  it('adds, edits and deletes monthly overheads without changing sale costs', async () => {
    vi.mocked(fetchSellerSales).mockResolvedValue([{ ...sale, gstPercent: 0 }]);
    render(<SellerSalesDashboard refreshKey={0} />);
    fireEvent.click(screen.getByRole('button', { name: /Sales dashboard/ }));
    await waitFor(() => expect(fetchBusinessExpenses).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Business expenses' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add expense' })).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    fireEvent.change(screen.getByLabelText('Expense description'), { target: { value: 'Ads' } });
    fireEvent.change(screen.getByLabelText('Expense amount'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(screen.getByRole('button', { name: 'Refresh dashboard' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /^Refresh$/ })).toHaveProperty('disabled', true);
    expect(await screen.findByText('Business expense saved.')).toBeTruthy();
    expect(saveBusinessExpense).toHaveBeenCalledWith(expect.objectContaining({ amount: 20, description: 'Ads' }), undefined);
    expect(screen.getByText('Profit after business expenses').parentElement?.textContent).toContain('₹87');
    fireEvent.click(screen.getByRole('button', { name: 'Edit expense Ads' }));
    fireEvent.change(screen.getByLabelText('Expense amount'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    await waitFor(() => expect(screen.getByText('Profit after business expenses').parentElement?.textContent).toContain('-₹13'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete expense Ads' }));
    expect(deleteBusinessExpense).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete expense' }));
    expect(await screen.findByText('Business expense deleted.')).toBeTruthy();
    expect(screen.getByText('Profit after business expenses').parentElement?.textContent).toContain('₹107');
    expect(product.gstPercent).toBe(5);
    expect(createSellerSale).not.toHaveBeenCalled();
  });

  it('filters expenses by month and counts losses without sales, but no margin', async () => {
    vi.mocked(fetchBusinessExpenses).mockResolvedValue([
      { id: 'oct', description: 'Ads', expenseDate: '2026-10-01', amount: 100, category: 'Advertising', notes: '' },
      { id: 'sep', description: 'Rent', expenseDate: '2026-09-01', amount: 50, category: 'Rent & utilities', notes: '' },
    ]);
    render(<SellerSalesDashboard refreshKey={0} />);
    fireEvent.click(screen.getByRole('button', { name: /Sales dashboard/ }));
    await waitFor(() => expect(screen.getByText('Profit after business expenses').parentElement?.textContent).toContain('-₹100'));
    expect(screen.getByText('Margin after business expenses').parentElement?.textContent).toContain('—');
    fireEvent.change(screen.getByLabelText('Sales month'), { target: { value: '2026-09' } });
    expect(screen.getByText('Profit after business expenses').parentElement?.textContent).toContain('-₹50');
  });

  it('does not show profit after overheads as zero when expense loading fails', async () => {
    vi.mocked(fetchBusinessExpenses).mockRejectedValue(new Error('Expense loading failed'));
    render(<SellerSalesDashboard refreshKey={0} />);
    fireEvent.click(screen.getByRole('button', { name: /Sales dashboard/ }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Expense loading failed');
    expect(screen.getByText('Profit after business expenses').parentElement?.textContent).toContain('—');
    fireEvent.click(screen.getByRole('button', { name: 'Business expenses' }));
    expect(screen.getByRole('button', { name: 'Add expense' })).toHaveProperty('disabled', true);
    vi.mocked(fetchBusinessExpenses).mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh dashboard' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add expense' })).toHaveProperty('disabled', false));
  });

  it('preserves expense drafts and existing amounts when saving fails', async () => {
    vi.mocked(saveBusinessExpense).mockRejectedValueOnce(new Error('Cannot save expense'));
    render(<SellerSalesDashboard refreshKey={0} />);
    fireEvent.click(screen.getByRole('button', { name: /Sales dashboard/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Business expenses' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add expense' })).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    fireEvent.change(screen.getByLabelText('Expense description'), { target: { value: 'Tools' } });
    fireEvent.change(screen.getByLabelText('Expense amount'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Cannot save expense');
    expect(screen.getByLabelText('Expense amount')).toHaveProperty('value', '10');
    expect(screen.getByText('Profit after business expenses').parentElement?.textContent).toContain('₹0');
  });

  it.each([
    [65, 'text-green-800'],
    [65.01, 'text-red-800'],
  ])('colors monthly and individual sale margins with cost %s', async (materialCost, color) => {
    vi.mocked(fetchSellerSales).mockResolvedValue([{
      ...sale,
      unitPrice: 100,
      gstPercent: 0,
      materialCost,
      labourCost: 0,
      packagingCost: 0,
      shippingCost: 0,
    }]);
    render(<SellerSalesDashboard refreshKey={0} />);
    fireEvent.click(screen.getByRole('button', { name: /Sales dashboard/ }));
    await waitFor(() => {
      expect(screen.getByText('Profit margin').parentElement?.className).toContain(color);
      expect(screen.getByText('Est. profit · margin').parentElement?.className).toContain(color);
    });
  });

  it('keeps a zero-GST sale separate from the product GST and subsequent sales', async () => {
    const originalProduct = structuredClone(product);
    render(<SellerSalesDashboard refreshKey={0} />);
    await waitFor(() => expect(fetchManagedProducts).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Sales dashboard/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }));
    fireEvent.change(screen.getByLabelText('Sale product'), { target: { value: product.id } });
    expect(screen.getByLabelText('Sale GST rate')).toHaveProperty('value', '5');
    fireEvent.change(screen.getByLabelText('Sale GST rate'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save sale' }));
    await waitFor(() => expect(createSellerSale).toHaveBeenCalledWith(expect.objectContaining({
      productId: product.id, gstPercent: 0,
    })));
    expect(await screen.findByText('Sale recorded.')).toBeTruthy();
    expect(product).toEqual(originalProduct);
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }));
    fireEvent.change(screen.getByLabelText('Sale product'), { target: { value: product.id } });
    expect(screen.getByLabelText('Sale GST rate')).toHaveProperty('value', '5');
  });

  it('marks required sale entries but leaves the optional product selector and notes unmarked', async () => {
    render(<SellerSalesDashboard refreshKey={0} />);
    await waitFor(() => expect(fetchSellerSales).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Sales dashboard/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }));
    for (const label of ['Sale product name', 'Sale date', 'Sales channel', 'Sale quantity',
      'Unit selling price', 'Sale GST rate', 'Materials per piece (₹)', 'Labour per piece (₹)',
      'Packaging per piece (₹)', 'Shipping cost for this sale (₹)', 'Payment processing fee (%)',
      'GST on payment fee (%)']) {
      expect(screen.getByLabelText(label).closest('label')?.querySelector('.text-red-600')).toBeTruthy();
    }
    for (const label of ['Sale product', 'Sale notes']) {
      expect(screen.getByLabelText(label).closest('label')?.querySelector('.text-red-600')).toBeNull();
    }
    expect(screen.getByText(/Enter 0 for costs or fees/)).toBeTruthy();
  });

  it('starts collapsed and preserves form values when collapsed and reopened', async () => {
    render(<SellerSalesDashboard refreshKey={0} />);
    const toggle = screen.getByRole('button', { name: /Sales dashboard/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Record sale' })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }));
    fireEvent.change(screen.getByLabelText('Sale product name'), {
      target: { value: 'Custom flower' },
    });
    fireEvent.click(toggle);
    expect(screen.queryByRole('button', { name: 'Save sale' })).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Sale product name')).toHaveProperty('value', 'Custom flower');
    await waitFor(() => expect(fetchSellerSales).toHaveBeenCalled());
  });

  it('prefills the selected product values and records an editable-channel sale', async () => {
    render(<SellerSalesDashboard refreshKey={0} />);
    await waitFor(() => expect(fetchSellerSales).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Sales dashboard/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }));
    fireEvent.change(screen.getByLabelText('Sale product'), {
      target: { value: product.id },
    });
    expect(screen.getByLabelText('Unit selling price')).toHaveProperty('value', '250');
    expect(screen.getByLabelText('Sale GST rate')).toHaveProperty('value', '5');
    expect(screen.getByLabelText('Materials per piece (₹)')).toHaveProperty('value', '25');
    expect(screen.getByLabelText('Labour per piece (₹)')).toHaveProperty('value', '50');

    fireEvent.change(screen.getByLabelText('Sales channel'), {
      target: { value: 'online' },
    });
    expect(screen.getByLabelText('Payment processing fee (%)')).toHaveProperty('value', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Save sale' }));

    await waitFor(() => expect(createSellerSale).toHaveBeenCalledWith(expect.objectContaining({
      productId: product.id,
      productName: product.name,
      variantName: 'Pink',
      unitPrice: 250,
      gstPercent: 5,
      materialCost: 25,
      labourCost: 50,
      packagingCost: 8,
      shippingCost: 60,
      channel: 'online',
      gatewayFeePercent: 2,
      gatewayFeeGstPercent: 18,
    })));
    expect(await screen.findByText('Sale recorded.')).toBeTruthy();
  });
});
