import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdminDialog from './AdminDialog';
import { mockNativeDialog } from './dialogTestSupport';

let restore: () => void;
beforeEach(() => { restore = mockNativeDialog(); });
afterEach(() => { cleanup(); restore(); });

it('opens a labelled modal, restores focus and scrolling, and prevents closing while busy', () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const onClose = vi.fn();
  const view = render(<AdminDialog title="Add product" onClose={onClose}><input aria-label="Name" /></AdminDialog>);
  expect(screen.getByRole('dialog', { name: 'Add product' })).toHaveProperty('open', true);
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
  expect(onClose).toHaveBeenCalledOnce();
  view.rerender(<AdminDialog title="Add product" onClose={onClose} busy><input aria-label="Name" /></AdminDialog>);
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Close Add product' }));
  expect(onClose).toHaveBeenCalledOnce();
  view.unmount();
  expect(document.body.style.overflow).toBe('');
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});
