import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useState } from 'react';
import RichTextEditor from './RichTextEditor';

afterEach(cleanup);

function EditorHarness() {
  const [value, setValue] = useState('A handmade product description.');
  return <RichTextEditor label="Description" value={value} onChange={setValue} maxLength={1000} />;
}

it('formats selected text and inserts an emoji at the cursor', async () => {
  render(<EditorHarness />);
  const input = screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement;
  input.setSelectionRange(2, 10);
  fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
  expect(input.value).toBe('A **handmade** product description.');
  expect(screen.getByText('handmade', { selector: 'strong' })).toBeTruthy();

  input.setSelectionRange(2, 2);
  fireEvent.click(screen.getByText('Add emoji'));
  fireEvent.click(screen.getByRole('button', { name: 'Insert Smiling face' }));
  expect(input.value).toBe('A 😊**handmade** product description.');
  await waitFor(() => expect(input.selectionStart).toBe(4));
});

it('does not insert an emoji that would exceed the plain-text character limit', () => {
  function LimitedEditor() {
    const [value, setValue] = useState('a'.repeat(999));
    return <RichTextEditor label="Customer quote" value={value} onChange={setValue} maxLength={1000} />;
  }
  render(<LimitedEditor />);
  const input = screen.getByRole('textbox', { name: 'Customer quote' }) as HTMLTextAreaElement;
  input.setSelectionRange(input.value.length, input.value.length);
  fireEvent.click(screen.getByText('Add emoji'));
  fireEvent.click(screen.getByRole('button', { name: 'Insert Red heart' }));
  expect(input.value).toBe('a'.repeat(999));
  expect(screen.getByRole('alert')).toHaveProperty('textContent', 'The quote must stay within 1,000 characters. Shorten it before adding an emoji.');
});
