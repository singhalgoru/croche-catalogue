import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CatalogueNotice from './CatalogueNotice';
import { CATALOGUE_CONNECTION_MESSAGE } from '../utils/catalogueError';

afterEach(cleanup);

it('shows themed connection guidance and prevents repeated retries while checking', async () => {
  let finish!: () => void;
  const retry = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  render(<CatalogueNotice message={CATALOGUE_CONNECTION_MESSAGE} onRetry={retry} />);
  expect(screen.getByRole('alert').className).toContain('bg-cream');
  expect(screen.getByText(CATALOGUE_CONNECTION_MESSAGE)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.getByRole('button', { name: 'Checking connection...' })).toHaveProperty('disabled', true);
  expect(retry).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(screen.getByRole('button', { name: 'Try again' })).toHaveProperty('disabled', false);
});

it('keeps unexpected errors explicit instead of blaming the connection', () => {
  render(<CatalogueNotice message="Permission denied" />);
  expect(screen.getByRole('alert').textContent).toContain('Permission denied');
  expect(screen.getByRole('alert').className).toContain('bg-red-50');
});
