import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import RichTextContent from '../components/RichTextContent';
import { richTextToPlainText } from './richText';

afterEach(cleanup);

it('converts formatting and list markers to plain text for search and sharing', () => {
  expect(richTextToPlainText('**Handmade** bag\n- Cotton yarn\n- *Gentle care*'))
    .toBe('Handmade bag\nCotton yarn\nGentle care');
});

it('renders allowed formatting as React elements and keeps untrusted markup as text', () => {
  const { container } = render(<RichTextContent value={'**Bold** and *italic*\n\n- item\n<img src=x onerror=alert(1)>'} />);
  expect(container.querySelector('strong')?.textContent).toBe('Bold');
  expect(container.querySelector('em')?.textContent).toBe('italic');
  expect(container.querySelector('ul li')?.textContent).toBe('item');
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
});
