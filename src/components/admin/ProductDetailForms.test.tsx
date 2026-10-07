import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductUploadForm from './ProductUploadForm';
import ProductManager from './ProductManager';
import { fetchManagedProducts, publishProduct, updateProduct } from '../../services/products';
import type { ManagedProduct } from '../../services/products';
import { suggestProductGstRate } from '../../services/productAnalysis';

vi.mock('../../services/products', () => ({
  fetchManagedProducts: vi.fn(), publishProduct: vi.fn(), updateProduct: vi.fn(),
  deleteProduct: vi.fn(), reorderProducts: vi.fn(),
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

beforeEach(() => {
  vi.mocked(fetchManagedProducts).mockResolvedValue([product]);
  vi.mocked(publishProduct).mockResolvedValue(product);
  vi.mocked(updateProduct).mockResolvedValue(product);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Product detail admin integration', () => {
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
    fireEvent.change(screen.getByLabelText('Coaster time spent'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('Coaster time unit'), { target: { value: 'minutes' } });
    fireEvent.change(screen.getByLabelText('Coaster materials cost'), { target: { value: '100' } });
    vi.mocked(suggestProductGstRate).mockResolvedValue({
      suggestedRate: 5, confidence: 'low', rationale: 'Verify exact HSN classification.',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest GST with Gemini' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use suggested rate in estimate' }));
    expect(await screen.findByText('Suggested ₹975 before GST')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use in product editor' }));
    expect(screen.getByLabelText('Price (₹)')).toHaveProperty('value', '975');
    expect(updateProduct).not.toHaveBeenCalled();
    expect(suggestProductGstRate).toHaveBeenCalledWith({
      name: 'Coaster', category: 'Home', description: 'A handmade coaster.',
      materials: 'Cotton yarn', includedItems: '',
    });
  });
});
