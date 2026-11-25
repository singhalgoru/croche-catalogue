import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImageGenerationPanel from './ImageGenerationPanel';
import { generateProductImage, optimizeProductImagePrompt } from '../../services/productImageGeneration';

vi.mock('../../services/productImageGeneration', () => ({
  generateProductImage: vi.fn(),
  optimizeProductImagePrompt: vi.fn(),
}));

const writeText = vi.fn();
const optimized = 'Soft morning light and neutral props; preserve the original crochet product.';
function open(disabled = false) {
  render(<ImageGenerationPanel sourceFile={new File(['photo'], 'photo.webp', { type: 'image/webp' })}
    sourceUrl="https://images.luviacreations.com/photo.webp" disabled={disabled} onUseImage={vi.fn()} />);
}
function enterInstruction(value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: /Optional instruction/ }), { target: { value } });
}
beforeEach(() => {
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  writeText.mockResolvedValue(undefined);
  vi.mocked(optimizeProductImagePrompt).mockResolvedValue(optimized);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe('image prompt copying', () => {
  it('provides a styled website prompt and an aspect-only Pinterest prompt', async () => {
    open();
    enterInstruction('Use a wooden basket.');
    const website = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Website prompt (1:1)' });
    const pinterest = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Pinterest prompt (2:3)' });
    expect(website.value).toContain('square 1:1');
    expect(website.value).toContain('Use a wooden basket.');
    expect(pinterest.value).toContain('2:3 portrait');
    expect(pinterest.value).toContain('1000 x 1500');
    expect(website.value).toContain('Preserve its exact shape');
    expect(website.value).toContain('No text, logos, watermarks');
    expect(pinterest.value).toContain('Keep the original photo, product, any person and pose');
    expect(pinterest.value).toContain('one seamless photograph—no horizontal edge, strip, panel or blank area');
    expect(pinterest.value).toContain('move it onto the bottom-right of the photograph, not into a separate section');
    expect(pinterest.value).not.toContain('Use a wooden basket.');
    expect(pinterest.value).not.toContain('create a realistic product photograph');
    fireEvent.click(screen.getByRole('button', { name: 'Copy website prompt' }));
    await screen.findByText('Prompt copied.');
    expect(writeText).toHaveBeenLastCalledWith(website.value);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Pinterest prompt' }));
    await screen.findByText('Prompt copied.');
    expect(writeText).toHaveBeenLastCalledWith(pinterest.value);
    expect(generateProductImage).not.toHaveBeenCalled();
    expect(optimizeProductImagePrompt).not.toHaveBeenCalled();
    enterInstruction('New styling.');
    expect(website.value).toContain('New styling.');
    expect(pinterest.value).not.toContain('New styling.');
    expect(screen.getByText('Prompt copied.')).toBeTruthy();
  });

  it('allows manual copying if a separate prompt cannot be copied', async () => {
    writeText.mockRejectedValue(new Error('Permission denied.'));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Copy Pinterest prompt' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Select and copy the prompt above.');
    expect(screen.getByRole('textbox', { name: 'Pinterest prompt (2:3)' })).toHaveProperty('readOnly', true);
  });

  it('copies the combined style and trimmed custom instruction without invoking AI', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Warm minimal' }));
    enterInstruction('  Use a wooden basket.  ');
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    await screen.findByText('Prompt copied.');
    expect(writeText).toHaveBeenCalledWith('Use a warm cream palette, soft natural light, and very minimal neutral props. Use a wooden basket.');
    expect(generateProductImage).not.toHaveBeenCalled();
    expect(optimizeProductImagePrompt).not.toHaveBeenCalled();
    enterInstruction('Different idea.');
    expect(screen.queryByText('Prompt copied.')).toBeNull();
  });

  it('copies Gemini-optimized text rather than the original draft', async () => {
    open();
    enterInstruction('morning light, props');
    fireEvent.click(screen.getByRole('button', { name: 'Optimize prompt with Gemini' }));
    await screen.findByDisplayValue(optimized);
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    await screen.findByText('Prompt copied.');
    expect(writeText).toHaveBeenCalledWith(optimized);
  });

  it('disables copying for an empty or whitespace-only instruction', () => {
    open();
    const button = screen.getByRole('button', { name: 'Copy prompt' });
    expect(button).toHaveProperty('disabled', true);
    enterInstruction('   ');
    expect(button).toHaveProperty('disabled', true);
  });

  it('disables copying when the parent is disabled', () => {
    open(true);
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('disables copying while Gemini optimizes the prompt', async () => {
    vi.mocked(optimizeProductImagePrompt).mockReturnValue(new Promise(() => {}));
    open();
    enterInstruction('morning light');
    fireEvent.click(screen.getByRole('button', { name: 'Optimize prompt with Gemini' }));
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toHaveProperty('disabled', true);
  });

  it('reports clipboard failure and keeps the draft intact for manual copying', async () => {
    writeText.mockRejectedValue(new Error('Permission denied.'));
    open();
    enterInstruction('Use a wooden basket.');
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Unable to copy automatically');
    expect(screen.getByRole('textbox', { name: /Optional instruction/ })).toHaveProperty('value', 'Use a wooden basket.');
    expect(screen.queryByText('Prompt copied.')).toBeNull();
  });
});
