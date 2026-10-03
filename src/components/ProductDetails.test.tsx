import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ProductDetails from './ProductDetails';

afterEach(cleanup);

describe('ProductDetails', () => {
  it('does not render empty sections for existing products', () => {
    const { container } = render(<ProductDetails product={{ materials: '  ' }} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows only provided specifications and care as collapsible sections', () => {
    const { container } = render(<ProductDetails product={{ materials: 'Cotton yarn', includedItems: 'One coaster', careInstructions: 'Hand wash gently.' }} />);
    expect(container.querySelectorAll('details')).toHaveLength(2);
    expect(screen.getByText('Cotton yarn')).toBeTruthy();
    expect(screen.getByText('One coaster')).toBeTruthy();
    expect(screen.queryByText('Dimensions')).toBeNull();
    expect(screen.getByText('Hand wash gently.')).toBeTruthy();
  });

  it('renders product facts as text rather than HTML', () => {
    const { container } = render(<ProductDetails product={{ materials: '<script>unsafe</script>' }} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>unsafe</script>');
  });
});
