import { useId, useRef, useState } from 'react';
import RichTextContent from '../RichTextContent';
import { richTextToPlainText } from '../../utils/richText';
import EmojiPicker from './EmojiPicker';

interface Props {
  label: string;
  id?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength: number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  showPreview?: boolean;
  emojiLabel?: string;
}

export default function RichTextEditor({
  label, id, value, onChange, rows = 4, maxLength, required = false, disabled = false,
  className = '', showPreview = true, emojiLabel = 'Add emoji',
}: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helpId = useId();
  const localInputRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = localInputRef;
  const [limitError, setLimitError] = useState('');
  const limitMessage = label === 'Customer quote'
    ? 'The quote must stay within 1,000 characters.'
    : `${label} must stay within ${maxLength.toLocaleString()} characters.`;

  const wrapSelection = (marker: string, placeholder: string) => {
    const input = textareaRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selection = value.slice(start, end);
    const content = selection || placeholder;
    const replacement = `${marker}${content}${marker}`;
    const next = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
    if (next.length > maxLength || richTextToPlainText(next).length > maxLength) {
      setLimitError(`${limitMessage} Remove some text before formatting.`);
      return;
    }
    setLimitError('');
    onChange(next);
    requestAnimationFrame(() => {
      if (!input.isConnected) return;
      input.focus();
      const selectionStart = start + marker.length;
      input.setSelectionRange(selectionStart, selectionStart + content.length);
    });
  };

  const toggleList = (prefix: string) => {
    const input = textareaRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const lineEndIndex = value.indexOf('\n', end);
    const lineEnd = lineEndIndex < 0 ? value.length : lineEndIndex;
    const selectedLines = value.slice(lineStart, lineEnd).split('\n');
    const nextLines = selectedLines.map(line => `${prefix}${line}`);
    const replacement = nextLines.join('\n');
    const next = `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`;
    if (next.length > maxLength || richTextToPlainText(next).length > maxLength) {
      setLimitError(`${limitMessage} Remove some text before adding a list.`);
      return;
    }
    setLimitError('');
    onChange(next);
    requestAnimationFrame(() => {
      if (!input.isConnected) return;
      input.focus();
      input.setSelectionRange(lineStart, lineStart + replacement.length);
    });
  };

  const insertEmoji = (emoji: string) => {
    const input = textareaRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const next = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
    if (next.length > maxLength || richTextToPlainText(next).length > maxLength) {
      setLimitError(label === 'Customer quote'
        ? 'The quote must stay within 1,000 characters. Shorten it before adding an emoji.'
        : `${label} must stay within ${maxLength.toLocaleString()} characters.`);
      return;
    }
    setLimitError('');
    onChange(next);
    requestAnimationFrame(() => {
      if (!input.isConnected) return;
      input.focus();
      input.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const plainText = richTextToPlainText(value);
  return <div className={className}>
    <label htmlFor={inputId} className="sr-only">{label}</label>
    <div role="toolbar" aria-label={`${label} formatting`} className="mb-1 flex flex-wrap gap-1">
      <button type="button" disabled={disabled} aria-label="Bold" onMouseDown={event => event.preventDefault()}
        onClick={() => wrapSelection('**', 'bold text')}
        className="min-h-9 min-w-9 rounded-md border border-cocoa/20 bg-white px-2 text-sm font-semibold disabled:opacity-50"><strong>B</strong></button>
      <button type="button" disabled={disabled} aria-label="Italic" onMouseDown={event => event.preventDefault()}
        onClick={() => wrapSelection('*', 'italic text')}
        className="min-h-9 min-w-9 rounded-md border border-cocoa/20 bg-white px-2 text-sm font-semibold disabled:opacity-50"><em>I</em></button>
      <button type="button" disabled={disabled} aria-label="Bulleted list" onMouseDown={event => event.preventDefault()}
        onClick={() => toggleList('- ')}
        className="min-h-9 rounded-md border border-cocoa/20 bg-white px-2 text-sm font-semibold disabled:opacity-50">• List</button>
      <button type="button" disabled={disabled} aria-label="Numbered list" onMouseDown={event => event.preventDefault()}
        onClick={() => toggleList('1. ')}
        className="min-h-9 rounded-md border border-cocoa/20 bg-white px-2 text-sm font-semibold disabled:opacity-50">1. List</button>
    </div>
    <textarea
      ref={textareaRef}
      id={inputId}
      aria-describedby={helpId}
      aria-label={label}
      required={required}
      disabled={disabled}
      rows={rows}
      value={value}
      onChange={event => {
        if (event.target.value.length > maxLength || richTextToPlainText(event.target.value).length > maxLength) {
          setLimitError(limitMessage);
          return;
        }
        setLimitError('');
        onChange(event.target.value);
      }}
      className="w-full resize-y rounded-xl border border-cocoa/25 bg-white p-3 font-normal"
    />
    <p id={helpId} className={`mt-1 text-xs ${plainText.length > maxLength ? 'text-red-700' : 'text-cocoa/70'}`}>
      {plainText.length}/{maxLength} visible characters
      {plainText.length !== value.length && ` · ${value.length}/${maxLength} stored`}
      {' '}· Use **bold**, *italic*, and list formatting.
    </p>
    {limitError && <p role="alert" className="text-xs text-red-700">{limitError}</p>}
    <EmojiPicker label={emojiLabel} onSelect={insertEmoji} />
    {showPreview && <div aria-label={`${label} preview`} className="mt-2 rounded-lg border border-cocoa/15 bg-cream/40 p-3 text-sm">
      <p className="mb-1 text-xs font-semibold text-cocoa/60">Preview</p>
      <RichTextContent value={value} className="space-y-2 whitespace-normal break-words" />
    </div>}
  </div>;
}
