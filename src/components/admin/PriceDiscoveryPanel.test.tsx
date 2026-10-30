import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PriceDiscoveryPanel from './PriceDiscoveryPanel';
import { DEFAULT_PRICE_DISCOVERY_DEFAULTS, type PriceDiscoveryInputs } from './priceDiscovery';

afterEach(cleanup);

const inputs: PriceDiscoveryInputs = {
  timeSpent: '1', timeUnit: 'hours', materialCost: '50',
  shippingCost: '100', packagingCost: '10', gstPercent: '5', targetMarginPercent: '35',
};

describe('PriceDiscoveryPanel summary', () => {
  it('shows labour beside time even with incomplete other costs and saves a product rate', async () => {
    const change = vi.fn(); const save = vi.fn().mockResolvedValue(undefined);
    const props = { product: { name: 'Coaster', category: 'Home', description: 'Cotton coaster' },
      inputs: { ...inputs, materialCost: '', timeSpent: '90', timeUnit: 'minutes' as const },
      defaults: DEFAULT_PRICE_DISCOVERY_DEFAULTS, onInputsChange: change, onApplyPrice: vi.fn(), onSaveInputs: save };
    const { rerender } = render(<PriceDiscoveryPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Price discovery/ }));
    expect(screen.getByText('₹150')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Coaster labour rate per hour'), { target: { value: '200' } });
    expect(change).toHaveBeenCalledWith({ ...props.inputs, labourRate: '200' });
    rerender(<PriceDiscoveryPanel {...props} inputs={{ ...inputs, timeSpent: '90', timeUnit: 'minutes', labourRate: '200' }} />);
    expect(screen.getByText(/Labour cost per piece:/).textContent).toContain('₹300');
    fireEvent.click(screen.getByRole('button', { name: /Save.*values/ }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ labourRate: '200' })));
    fireEvent.change(screen.getByLabelText('Coaster labour rate per hour'), { target: { value: '' } });
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ labourRate: '' }));
  });
  it('shows achieved margin at the rounded recommendation, not the target or edited price', () => {
    render(<PriceDiscoveryPanel
      product={{ name: 'Coaster', category: 'Home', description: 'Cotton coaster' }}
      inputs={inputs}
      defaults={DEFAULT_PRICE_DISCOVERY_DEFAULTS}
      onInputsChange={vi.fn()}
      onApplyPrice={vi.fn()}
      onSaveInputs={vi.fn()}
    />);
    expect(screen.getByText('Suggested ₹440 including GST · 35.5% estimated margin')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Price discovery/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Suggest price' }));
    fireEvent.change(screen.getByLabelText('Coaster customer price including GST'), { target: { value: '1000' } });
    expect(screen.getByText('Suggested ₹440 including GST · 35.5% estimated margin')).toBeTruthy();
  });

  it('retains the input prompt without displaying a made-up margin when costs are missing', () => {
    render(<PriceDiscoveryPanel
      product={{ name: 'Coaster', category: 'Home', description: 'Cotton coaster' }}
      inputs={{ ...inputs, materialCost: '' }}
      defaults={DEFAULT_PRICE_DISCOVERY_DEFAULTS}
      onInputsChange={vi.fn()}
      onApplyPrice={vi.fn()}
      onSaveInputs={vi.fn()}
    />);
    expect(screen.getByText('Estimate costs and a selling price')).toBeTruthy();
    expect(screen.queryByText(/estimated margin/)).toBeNull();
  });
});
