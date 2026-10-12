import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import SalesPeriodSnapshot from './SalesPeriodSnapshot';
import type { BusinessExpense } from '../../services/businessExpenses';
import type { SellerSale } from '../../services/sellerSales';

afterEach(cleanup);
const expense: BusinessExpense = {
  id: 'test', description: 'Ads', expenseDate: '2025-03-31',
  category: 'Advertising', amount: 25, notes: '',
};

describe('SalesPeriodSnapshot', () => {
  it('shows recorded material, labour and shipping costs for the selected year and quarters', () => {
    const sale: SellerSale = {
      id: 'sale', productId: null, productName: 'Rose', variantName: '', saleDate: '2025-03-31',
      channel: 'offline', quantity: 3, unitPrice: 200, gstPercent: 5,
      materialCost: 20, labourCost: 15, packagingCost: 5, shippingCost: 80,
      gatewayFeePercent: 0, gatewayFeeGstPercent: 18, notes: '', createdAt: '2026-01-01T00:00:00Z',
    };
    render(<SalesPeriodSnapshot sales={[sale]} expenses={[]} available initiallyExpanded />);
    fireEvent.change(screen.getByLabelText('Snapshot year'), { target: { value: '2025' } });
    for (const name of ['Year 2025 · Jan–Dec', 'Q1 · Jan–Mar 2025']) {
      const article = within(screen.getByRole('article', { name }));
      for (const [label, value] of [['Material cost', '₹60'], ['Labour cost', '₹45'], ['Shipping cost', '₹80']]) {
        expect(article.getByText(label).parentElement?.querySelector('dd')?.textContent).toBe(value);
      }
    }
    const empty = within(screen.getByRole('article', { name: 'Q2 · Apr–Jun 2025' }));
    for (const label of ['Material cost', 'Labour cost', 'Shipping cost']) {
      expect(empty.getByText(label).parentElement?.querySelector('dd')?.textContent).toBe('₹0');
    }
  });
  it('is collapsible and allows years with expenses alone', () => {
    render(<SalesPeriodSnapshot sales={[]} expenses={[expense]} available />);
    expect(screen.getByRole('button', { name: 'Quarterly & yearly snapshot' })).toHaveProperty('ariaExpanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Quarterly & yearly snapshot' }));
    fireEvent.change(screen.getByLabelText('Snapshot year'), { target: { value: '2025' } });
    expect(within(screen.getByRole('article', { name: 'Year 2025 · Jan–Dec' })).getByText('-₹25')).toBeTruthy();
    const quarter = within(screen.getByRole('article', { name: 'Q1 · Jan–Mar 2025' }));
    expect(quarter.getByText('-₹25')).toBeTruthy();
    expect(quarter.getByText('Margin after overheads: —')).toBeTruthy();
    expect(within(screen.getByRole('article', { name: 'Q2 · Apr–Jun 2025' })).queryByText('-₹25')).toBeNull();
  });

  it('updates the selected year snapshot when expense data changes', () => {
    const { rerender } = render(<SalesPeriodSnapshot sales={[]} expenses={[expense]} available />);
    fireEvent.click(screen.getByRole('button', { name: 'Quarterly & yearly snapshot' }));
    fireEvent.change(screen.getByLabelText('Snapshot year'), { target: { value: '2025' } });
    rerender(<SalesPeriodSnapshot sales={[]} expenses={[{ ...expense, amount: 50 }]} available />);
    expect(within(screen.getByRole('article', { name: 'Year 2025 · Jan–Dec' })).getByText('-₹50')).toBeTruthy();
    rerender(<SalesPeriodSnapshot sales={[]} expenses={[]} available />);
    expect(screen.getByLabelText('Snapshot year')).toHaveProperty('value', '2025');
    expect(within(screen.getByRole('article', { name: 'Year 2025 · Jan–Dec' })).queryByText('-₹50')).toBeNull();
  });

  it('does not present zero totals while data is unavailable', () => {
    render(<SalesPeriodSnapshot sales={[]} expenses={[]} available={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quarterly & yearly snapshot' }));
    expect(screen.getByRole('status').textContent).toContain('Snapshot unavailable');
    expect(screen.queryByRole('article')).toBeNull();
  });
});
