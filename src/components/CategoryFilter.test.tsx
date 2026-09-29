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

  it('shows the selected category first and restores its place once cleared', () => {
    const chipNames = () => screen.getAllByRole('button').map((chip) => chip.textContent);
    const { rerender } = render(
      <CategoryFilter categories={['Bags', 'Toys']} active="Toys" onSelect={vi.fn()} />,
    );

    expect(chipNames()).toEqual(['Toys', 'All', 'New', 'Bags']);
    expect(screen.getByRole('button', { name: 'Toys' }).getAttribute('aria-pressed')).toBe('true');

    rerender(<CategoryFilter categories={['Bags', 'Toys']} active="All" onSelect={vi.fn()} />);

    expect(chipNames()).toEqual(['All', 'New', 'Bags', 'Toys']);
  });
});
