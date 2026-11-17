export function richTextToPlainText(value: string) {
  return value
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .trim();
}
