import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CategoryFilter from './CategoryFilter';

afterEach(() => {
  cleanup();
});

describe('CategoryFilter', () => {
  it('shows the New filter when there are new products', () => {
    render(
      <CategoryFilter
        categories={['Bags']}
        active="All"
        onSelect={vi.fn()}
        showNew
      />,
    );

    expect(screen.getByRole('button', { name: 'New' })).not.toBeNull();
  });

  it('hides the New filter when there are no new products', () => {
    render(
      <CategoryFilter
        categories={['Bags']}
        active="All"
        onSelect={vi.fn()}
        showNew={false}
      />,
    );

    expect(screen.queryByRole('button', { name: 'New' })).toBeNull();
  });
});
