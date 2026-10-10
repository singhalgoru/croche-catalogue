import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AccountDialog from './AccountDialog';

vi.mock('./CustomerAccount', () => ({
  default: ({ initialMode }: { initialMode?: string }) => <p>Account form: {initialMode}</p>,
}));
afterEach(cleanup);

it('opens the requested account mode as an accessible dialog and closes with Escape', () => {
  const onClose = vi.fn();
  render(<AccountDialog mode="signup" onClose={onClose} />);
  expect(screen.getByRole('dialog', { name: 'Create your Luvia account' })).toBeTruthy();
  expect(screen.getByText('Account form: signup')).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close account' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});
