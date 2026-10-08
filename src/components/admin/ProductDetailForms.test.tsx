import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductUploadForm from './ProductUploadForm';
import ProductManager from './ProductManager';
import {
  fetchManagedProducts,
  publishProduct,
  saveProductPriceDiscoveryInputs,
  updateProduct,
} from '../../services/products';
import type { ManagedProduct } from '../../services/products';
import { suggestProductGstRate } from '../../services/productAnalysis';
import { loadProductDraft, saveProductDraft, EMPTY_PRODUCT_DRAFT } from './productDraftStore';
import { createDefaultPriceInputs } from './priceDiscovery';
import { createEmptyVariant } from './variantDraft';
import { mockNativeDialog } from './dialogTestSupport';

vi.mock('../../services/products', () => ({
  fetchManagedProducts: vi.fn(), publishProduct: vi.fn(), updateProduct: vi.fn(),
  saveProductPriceDiscoveryInputs: vi.fn(), deleteProduct: vi.fn(), reorderProducts: vi.fn(),
}));
vi.mock('../../services/productAnalysis', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/productAnalysis')>(),
  suggestProductGstRate: vi.fn(),
}));
vi.mock('./productDraftStore', async (original) => ({
  ...await original<typeof import('./productDraftStore')>(),
  loadProductDraft: vi.fn().mockResolvedValue(null),
  saveProductDraft: vi.fn(), clearProductDraft: vi.fn(),
}));
vi.mock('./ProductVariantManager', () => ({ default: () => null }));
vi.mock('./VariantDraftFields', () => ({
  default: ({ variants, onChange }: {
    variants: import('./variantDraft').VariantDraft[];
    onChange: (variants: import('./variantDraft').VariantDraft[]) => void;
  }) => <button type="button" onClick={() => onChange(variants.map(v => ({
    ...v, imageFile: new File(['photo'], 'photo.webp', { type: 'image/webp' }),
  })))}>Attach test photo</button>,
}));
const product: ManagedProduct = {
  id: 'test-product', name: 'Coaster', category: 'Home', description: 'A handmade coaster.',
  price: 100, showPrice: true, inStock: true, color: '#ffffff',
  image: '/coaster.webp', imagePath: 'coaster.webp', variants: [],
  published: true, materials: 'Cotton yarn',
  seoDescription: 'Handmade cotton crochet coaster.',
  publishedAt: null, createdAt: '2026-10-03T00:00:00Z',
};

let restoreDialog: () => void;
beforeEach(() => {
  restoreDialog = mockNativeDialog();
  vi.mocked(loadProductDraft).mockResolvedValue(null);
  vi.mocked(saveProductDraft).mockResolvedValue(undefined);
  vi.mocked(fetchManagedProducts).mockResolvedValue([product]);
  vi.mocked(publishProduct).mockResolvedValue(product);
  vi.mocked(updateProduct).mockResolvedValue(product);
  vi.mocked(saveProductPriceDiscoveryInputs).mockImplementation(async (savedProduct, inputs) => ({
    ...savedProduct,
    priceDiscoveryInputs: inputs,
  }));
});
afterEach(() => { cleanup(); restoreDialog(); vi.clearAllMocks(); });

describe('Product detail admin integration', () => {
  it('opens product entry in a dialog and retains entered details when closed and reopened', async () => {
    render(<ProductUploadForm categories={['Home']} onPublished={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Add product/ }));
    expect(screen.getByRole('dialog', { name: 'Add product' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Rose' } });
    expect(screen.getByLabelText('Materials')).toHaveProperty('required', true);
    expect(screen.getByLabelText("What's included")).toHaveProperty('required', true);
    expect(screen.getByLabelText('Dimensions')).toHaveProperty('required', false);
    for (const label of ['Product name', 'Category', 'Description', 'Materials', "What's included",
      'Minimum order quantity (pieces)']) {
      expect(screen.getByLabelText(label).closest('label')?.querySelector('.text-red-600')).toBeTruthy();
    }
    const priceInput = screen.getByLabelText('Price (₹)');
    expect(priceInput.closest('label')?.querySelector('.text-red-600')).toBeNull();
    fireEvent.click(screen.getByLabelText('Show this price in the catalogue'));
    expect(priceInput.closest('label')?.querySelector('.text-red-600')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close Add product' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Add product/ }));
    expect(screen.getByLabelText('Product name')).toHaveProperty('value', 'Rose');
    fireEvent.click(screen.getByRole('button', { name: 'Attach test photo' }));
    const form = screen.getByRole('button', { name: 'Publish product with 1 variant' }).closest('form');
    if (!form) throw new Error('Missing product upload form');
    fireEvent.submit(form);
    expect(screen.getByRole('alert').textContent).toContain('description');
    expect(publishProduct).not.toHaveBeenCalled();
  });

  it('discovers a GST-inclusive price for a new product and publishes saved costs, overrides and minimum quantity', async () => {
    render(<ProductUploadForm categories={['Home']} onPublished={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByRole('button', { name: /Add product/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Attach test photo' }));
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Coaster' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A handmade coaster.' } });
    fireEvent.change(screen.getByLabelText('Materials'), { target: { value: 'Cotton yarn' } });
    fireEvent.change(screen.getByLabelText("What's included"), { target: { value: 'One coaster' } });
    fireEvent.click(screen.getByRole('button', { name: /Price discovery/ }));
    expect(screen.getByLabelText('Coaster GST rate for estimate')).toHaveProperty('value', '5');
    fireEvent.change(screen.getByLabelText('Coaster time spent'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Coaster materials cost'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest price' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use in product editor' }));
    expect(Number((screen.getByLabelText('Price (₹)') as HTMLInputElement).value)).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Price (₹)'), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText('Minimum order quantity (pieces)'), { target: { value: '3' } });
    const form = screen.getByRole('button', { name: 'Publish product with 1 variant' }).closest('form');
    if (!form) throw new Error('Missing product upload form');
    fireEvent.submit(form);
    await waitFor(() => expect(publishProduct).toHaveBeenCalled());
    expect(vi.mocked(publishProduct).mock.calls[0][0]).toMatchObject({
      price: 400, showPrice: true, minimumOrderQuantity: 3, gstPercent: 5,
      profitMarginPercent: expect.closeTo(29.272, 2),
      priceDiscoveryInputs: { timeSpent: '1', timeUnit: 'hours', materialCost: '50',
        shippingCost: '100', packagingCost: '10', gstPercent: '5', targetMarginPercent: '45' },
    });
    expect(saveProductPriceDiscoveryInputs).not.toHaveBeenCalled();
  });

  it('keeps incomplete pricing in the draft and prevents publishing until it is completed', async () => {
    render(<ProductUploadForm categories={['Home']} onPublished={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Add product/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Attach test photo' }));
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Coaster' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A handmade coaster.' } });
    fireEvent.change(screen.getByLabelText('Materials'), { target: { value: 'Cotton yarn' } });
    fireEvent.change(screen.getByLabelText("What's included"), { target: { value: 'One coaster' } });
    fireEvent.click(screen.getByRole('button', { name: /Price discovery/ }));
    fireEvent.change(screen.getByLabelText('Coaster time spent'), { target: { value: '2' } });
    const form = screen.getByRole('button', { name: 'Publish product with 1 variant' }).closest('form');
    if (!form) throw new Error('Missing product upload form');
    fireEvent.submit(form);
    expect(await screen.findByText('Complete the price discovery cost and time fields before publishing.')).toBeTruthy();
    expect(publishProduct).not.toHaveBeenCalled();
  });

  it('restores draft pricing and surfaces explicit draft-save failures', async () => {
    vi.mocked(loadProductDraft).mockResolvedValue({
      draft: { ...EMPTY_PRODUCT_DRAFT, name: 'Coaster', minimumOrderQuantity: 3,
        priceDiscoveryInputs: { ...createDefaultPriceInputs(), timeSpent: '2', materialCost: '80' } },
      variants: [createEmptyVariant('Standard')], savedAt: Date.now(),
    });
    render(<ProductUploadForm categories={['Home']} onPublished={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Product name')).toHaveProperty('value', 'Coaster'));
    fireEvent.click(screen.getByRole('button', { name: /Price discovery/ }));
    expect(screen.getByLabelText('Coaster time spent')).toHaveProperty('value', '2');
    expect(screen.getByLabelText('Minimum order quantity (pieces)')).toHaveProperty('value', '3');
    vi.mocked(saveProductDraft).mockRejectedValueOnce(new Error('Draft storage full'));
    fireEvent.click(screen.getByRole('button', { name: 'Save values in draft' }));
    expect(await screen.findByText('Draft storage full')).toBeTruthy();
    expect(publishProduct).not.toHaveBeenCalled();
  });

  it('includes optional details when publishing a new product', async () => {
    render(<ProductUploadForm categories={['Home']} onPublished={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByRole('button', { name: /Add product/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Attach test photo' }));
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Coaster' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A handmade coaster.' } });
    fireEvent.change(screen.getByLabelText('SEO description'), { target: { value: 'Handmade cotton crochet coaster.' } });
    fireEvent.change(screen.getByLabelText('Materials'), { target: { value: 'Cotton yarn' } });
    fireEvent.change(screen.getByLabelText('Dimensions'), { target: { value: 'Approx. 10 cm' } });
    fireEvent.change(screen.getByLabelText("What's included"), { target: { value: 'One coaster' } });
    fireEvent.change(screen.getByLabelText('Care instructions'), { target: { value: 'Gentle hand wash' } });
    const form = screen.getByRole('button', { name: 'Publish product with 1 variant' }).closest('form');
    if (!form) throw new Error('Missing product upload form');
    fireEvent.submit(form);
    await waitFor(() => expect(publishProduct).toHaveBeenCalled());
    expect(vi.mocked(publishProduct).mock.calls[0][0]).toMatchObject({
      materials: 'Cotton yarn', dimensions: 'Approx. 10 cm',
      seoDescription: 'Handmade cotton crochet coaster.',
      includedItems: 'One coaster', careInstructions: 'Gentle hand wash',
    });
  });

  it('loads existing details and includes edits when saving', async () => {
    render(<ProductManager categories={['Home']} refreshKey={0} onChanged={vi.fn().mockResolvedValue(undefined)} />);
    await waitFor(() => expect(fetchManagedProducts).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Manage products/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/ }));
    expect(screen.getByLabelText('Materials')).toHaveProperty('value', 'Cotton yarn');
    expect(screen.getByLabelText('SEO description')).toHaveProperty('value', product.seoDescription);
    fireEvent.change(screen.getByLabelText('SEO description'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText("What's included"), { target: { value: 'Set of two' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateProduct).toHaveBeenCalled());
    expect(vi.mocked(updateProduct).mock.calls[0][1]).toMatchObject({
      materials: 'Cotton yarn', includedItems: 'Set of two', dimensions: '', careInstructions: '',
      seoDescription: '',
    });
  });

  it('calculates an indicative price and places it in the editor without saving automatically', async () => {
    render(<ProductManager categories={['Home']} refreshKey={0} onChanged={vi.fn().mockResolvedValue(undefined)} />);
    await waitFor(() => expect(fetchManagedProducts).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Manage products/ }));
    fireEvent.click(screen.getByRole('button', { name: /Estimate costs and a selling price/ }));
    expect(screen.getByLabelText('Coaster packaging cost')).toHaveProperty('value', '10');
    expect(screen.getByLabelText('Coaster target profit margin')).toHaveProperty('value', '45');
    fireEvent.change(screen.getByLabelText('Coaster time spent'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('Coaster time unit'), { target: { value: 'minutes' } });
    fireEvent.change(screen.getByLabelText('Coaster materials cost'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save values for this product' }));
    await waitFor(() => expect(saveProductPriceDiscoveryInputs).toHaveBeenCalledWith(
      product,
      expect.objectContaining({
        timeSpent: '120',
        timeUnit: 'minutes',
        materialCost: '100',
        shippingCost: '100',
        packagingCost: '10',
        gstPercent: '5',
        targetMarginPercent: '45',
      }),
    ));
    expect(await screen.findByText('Price discovery values saved for this product.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Suggest price' })).toBeTruthy();
    vi.mocked(suggestProductGstRate).mockResolvedValue({
      source: 'GST Accelerator HSN lookup · CBIC-sourced rates',
      candidates: [{
        hsnCode: '580810',
        hsnDescription: 'Hand-made braids in the piece',
        gstRate: 5,
        igstRate: 5,
        cgstRate: 2.5,
        sgstRate: 2.5,
        cessRate: 0,
        confidence: 0.84,
        notificationRef: '09/2025-CT(Rate)',
        conditionApplied: 'No additional conditions',
        conditionWarning: null,
        needsReview: true,
      }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Get GST rate & HSN' }));
    expect(await screen.findByText('HSN 580810 — Hand-made braids in the piece')).toBeTruthy();
    expect(screen.getByText(/Match confidence 84%/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Use 5% GST rate in estimate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suggest price' }));
    expect(await screen.findByText('Suggested customer price: ₹820 including GST')).toBeTruthy();
    const sellingPrice = screen.getByLabelText('Coaster customer price including GST');
    fireEvent.change(sellingPrice, { target: { value: '1100' } });
    expect(screen.getByText('Product profit margin')).toBeTruthy();
    expect(screen.getByText('58.4%')).toBeTruthy();
    expect(screen.getByText('Product profit margin').parentElement?.className).toContain('text-green-800');
    fireEvent.change(sellingPrice, { target: { value: '400' } });
    expect(screen.getByText('Product profit margin').parentElement?.className).toContain('text-red-800');
    fireEvent.change(sellingPrice, { target: { value: '1100' } });
    expect(screen.getByText('₹612')).toBeTruthy();
    fireEvent.change(sellingPrice, { target: { value: '' } });
    expect(screen.getByLabelText('Coaster customer price including GST')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use in product editor' })).toHaveProperty('disabled', true);
    fireEvent.change(sellingPrice, { target: { value: '1100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use in product editor' }));
    expect(screen.getByLabelText('Price (₹)')).toHaveProperty('value', '1100');
    expect(updateProduct).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Price (₹)'), { target: { value: '1200' } });
    expect(screen.getByLabelText('Coaster price override GST and margin').textContent)
      .toContain('₹58 GST is included');
    expect(screen.getByLabelText('Coaster price override GST and margin').textContent)
      .toContain('gateway fee: ₹29');
    expect(screen.getByLabelText('Coaster price override GST and margin').textContent)
      .toContain('61.6%');
    vi.mocked(updateProduct).mockResolvedValueOnce({
      ...product,
      price: 1200,
      profitMarginPercent: 61.647,
      gstPercent: 5,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateProduct).toHaveBeenCalled());
    expect(vi.mocked(updateProduct).mock.calls.at(-1)?.[1].profitMarginPercent).toBeCloseTo(61.647, 2);
    expect(vi.mocked(updateProduct).mock.calls.at(-1)?.[1].gstPercent).toBe(5);
    expect((await screen.findByLabelText('Coaster saved profit margin')).textContent).toContain('61.6%');
    expect(screen.getByText(/Saved profit margin: 61.6%/).className).toContain('text-green-800');
    expect((await screen.findByLabelText('Coaster saved profit margin')).textContent).toContain('GST 5% (₹58 included)');
    expect(suggestProductGstRate).toHaveBeenCalledWith({
      name: 'Coaster', category: 'Home', description: 'A handmade coaster.',
      materials: 'Cotton yarn', includedItems: '',
    });
  });

  it('starts each product at an independently editable 5% GST estimate', async () => {
    const secondProduct: ManagedProduct = {
      ...product,
      id: 'second-product',
      name: 'Bunny',
      category: 'Toys',
      description: 'A crochet bunny toy.',
      profitMarginPercent: 52,
      priceDiscoveryInputs: {
        timeSpent: '3',
        timeUnit: 'hours',
        materialCost: '160',
        shippingCost: '90',
        packagingCost: '12',
        gstPercent: '12',
        targetMarginPercent: '52',
      },
    };
    vi.mocked(fetchManagedProducts).mockResolvedValue([product, secondProduct]);
    render(<ProductManager categories={['Home', 'Toys']} refreshKey={0} onChanged={vi.fn().mockResolvedValue(undefined)} />);
    await waitFor(() => expect(fetchManagedProducts).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Manage products/ }));

    fireEvent.click(screen.getAllByRole('button', { name: /Price discovery/ })[1]);
    const coasterRate = screen.getByLabelText('Coaster GST rate for estimate');
    expect(screen.getByLabelText('Coaster target profit margin')).toHaveProperty('value', '45');
    expect(coasterRate).toHaveProperty('value', '5');
    fireEvent.change(coasterRate, { target: { value: '12' } });

    fireEvent.click(screen.getAllByRole('button', { name: /Price discovery/ })[1]);
    fireEvent.click(screen.getAllByRole('button', { name: /Price discovery/ })[2]);
    const bunnyRate = screen.getByLabelText('Bunny GST rate for estimate');
    expect(bunnyRate).toHaveProperty('value', '12');
    expect(screen.getByLabelText('Bunny target profit margin')).toHaveProperty('value', '52');
    expect(screen.getByLabelText('Bunny time spent')).toHaveProperty('value', '3');
    expect(screen.getByLabelText('Bunny materials cost')).toHaveProperty('value', '160');
    expect(screen.getByLabelText('Bunny shipping cost')).toHaveProperty('value', '90');
    expect(screen.getByLabelText('Bunny packaging cost')).toHaveProperty('value', '12');
    fireEvent.click(screen.getAllByRole('button', { name: /Price discovery/ })[1]);
    expect(screen.getByLabelText('Coaster GST rate for estimate')).toHaveProperty('value', '12');
  });
});
