import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PriceDiscoveryPanel from './PriceDiscoveryPanel';
import { DEFAULT_PRICE_DISCOVERY_DEFAULTS, type PriceDiscoveryInputs } from './priceDiscovery';

afterEach(cleanup);

const inputs: PriceDiscoveryInputs = {
  timeSpent: '1', timeUnit: 'hours', materialCost: '50',
  shippingCost: '100', packagingCost: '10', gstPercent: '5', targetMarginPercent: '35',
};

describe('PriceDiscoveryPanel summary', () => {
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
