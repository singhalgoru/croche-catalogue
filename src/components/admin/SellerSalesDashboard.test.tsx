import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SellerSalesDashboard from './SellerSalesDashboard';
import type { SellerSale, SellerSaleInput } from '../../services/sellerSales';
import type { ManagedProduct } from '../../services/products';
import { createSellerSale, fetchSellerSales } from '../../services/sellerSales';
import { fetchManagedProducts } from '../../services/products';

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
