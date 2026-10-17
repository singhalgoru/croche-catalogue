import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CategoryScenePrompt from './CategoryScenePrompt';
import { products } from '../../data/products';

const items = Array.from({ length: 7 }, (_, index) => ({
  ...products[0], id: `product-${index}`, name: `Scene product ${index}`,
  description: `Description ${index}`, dimensions: '10 x 12 cm', materials: 'Cotton',
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('requires selection, builds a product-specific prompt and enforces product preservation', () => {
  render(<CategoryScenePrompt category="Decor" products={items} disabled={false} />);
  expect(screen.getByRole('button', { name: 'Generate scene prompt' })).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByLabelText('Scene product 1', { selector: 'input' }));
  fireEvent.click(screen.getByLabelText('Scene product 0', { selector: 'input' }));
  fireEvent.change(screen.getByLabelText('Practical use for Scene product 1 (optional)'), { target: { value: 'Under a cup of tea.' } });
  fireEvent.change(screen.getByLabelText('Scene or occasion (optional)'), { target: { value: 'A cosy tea table.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate scene prompt' }));
  const prompt = screen.getByLabelText<HTMLTextAreaElement>('Generated scene prompt').value;
  expect(prompt).toContain('Decor collection');
  expect(prompt.indexOf('1. Scene product 1')).toBeLessThan(prompt.indexOf('2. Scene product 0'));
  for (const text of ['Description 1', '10 x 12 cm', 'Cotton', 'Under a cup of tea.', 'A cosy tea table.',
    'Do not change the pattern, size or colour of ANY product', 'override any conflicting',
    'Do NOT draw hotspots', 'WebP', 'ask for measurements rather than guessing']) {
    expect(prompt).toContain(text);
  }
  expect(prompt).not.toContain('Description 2');
  expect(screen.getByRole('link', { name: 'Open reference photo for Scene product 1' })).toHaveProperty('href', new URL(items[1].image, window.location.href).href);
});

it('caps selection at six without losing selected products during search and invalidates stale prompts', () => {
  const { rerender } = render(<CategoryScenePrompt category="Decor" products={items} disabled={false} />);
  for (let index = 0; index < 6; index++) fireEvent.click(screen.getByLabelText(`Scene product ${index}`, { selector: 'input' }));
  expect(screen.getByLabelText('Scene product 6', { selector: 'input' })).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('button', { name: 'Generate scene prompt' }));
  fireEvent.change(screen.getByLabelText('Search scene products'), { target: { value: 'product 6' } });
  expect(screen.getByLabelText('Generated scene prompt')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Scene or occasion (optional)'), { target: { value: 'New scene' } });
  expect(screen.queryByLabelText('Generated scene prompt')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Generate scene prompt' }));
  rerender(<CategoryScenePrompt category="Decor" products={[items[6]]} disabled={false} />);
  expect(screen.queryByLabelText('Generated scene prompt')).toBeNull();
  expect(screen.getByRole('button', { name: 'Generate scene prompt' })).toHaveProperty('disabled', true);
});

it('copies the prompt and surfaces clipboard failures while leaving manual copy available', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  render(<CategoryScenePrompt category="Decor" products={items} disabled={false} />);
  fireEvent.click(screen.getByLabelText('Scene product 0', { selector: 'input' }));
  fireEvent.click(screen.getByRole('button', { name: 'Generate scene prompt' }));
  fireEvent.click(screen.getByRole('button', { name: 'Copy scene prompt' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('copied'));
  expect(writeText).toHaveBeenCalledWith(screen.getByLabelText<HTMLTextAreaElement>('Generated scene prompt').value);
  writeText.mockRejectedValueOnce(new Error('Clipboard denied'));
  fireEvent.click(screen.getByRole('button', { name: 'Copy scene prompt' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Clipboard denied'));
  expect(screen.getByLabelText('Generated scene prompt')).toHaveProperty('readOnly', true);
});
