import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FeedbackForm from './FeedbackForm';
const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock('../services/feedback', () => ({ submitFeedback: submit }));
beforeEach(() => { vi.clearAllMocks(); submit.mockResolvedValue(undefined); });
afterEach(cleanup);
function open() {
  render(<FeedbackForm />);
}
it('collects only optional identity and requires an email for requested replies', () => {
  open();
  expect(screen.queryByLabelText('Reply email')).toBeNull();
  expect(screen.getByLabelText('Name (optional)')).toHaveProperty('required', false);
  expect(screen.getByLabelText('Your feedback')).toHaveProperty('required', true);
  fireEvent.click(screen.getByLabelText("I'd like a reply"));
  expect(screen.getByLabelText('Reply email')).toHaveProperty('required', true);
  fireEvent.change(screen.getByLabelText('Reply email'), { target: { value: 'reply@example.test' } });
  fireEvent.click(screen.getByLabelText("I'd like a reply"));
  expect(screen.queryByLabelText('Reply email')).toBeNull();
});
it('saves feedback with accurate queued delivery confirmation and clears the form', async () => {
  open();
  fireEvent.change(screen.getByLabelText('Your feedback'), { target: { value: 'Please add colour options.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
  expect((await screen.findByRole('status')).textContent).toContain('queued for feedback@luviacreations.com');
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ name: '', email: '', wantsReply: false }));
  expect(screen.getByLabelText('Your feedback')).toHaveProperty('value', '');
});
it('reuses a request ID when retrying the same failed submission', async () => {
  open(); submit.mockRejectedValue(new Error('Connection interrupted.'));
  fireEvent.change(screen.getByLabelText('Your feedback'), { target: { value: 'Please add colour options.' } });
  const form = screen.getByRole('form', { name: 'Share feedback form' });
  fireEvent.click(within(form).getByRole('button', { name: 'Send feedback' }));
  await screen.findByRole('alert');
  const id = submit.mock.calls[0][0].requestId;
  fireEvent.click(within(form).getByRole('button', { name: 'Send feedback' }));
  await screen.findByRole('alert');
  expect(submit.mock.calls[1][0].requestId).toBe(id);
});
