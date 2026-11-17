import { Fragment, type ReactNode } from 'react';

const listPrefix = /^\s*(?:[-*+]|\d+\.)\s+/;

function renderInline(value: string, keyPrefix: string): ReactNode[] {
  const tokens = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
  const nodes: ReactNode[] = [];
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(value))) {
    if (match.index > start) nodes.push(value.slice(start, match.index));
    const token = match[0];
    const bold = token.startsWith('**') || token.startsWith('__');
    const markerLength = bold ? 2 : 1;
    const content = token.slice(markerLength, -markerLength);
    nodes.push(bold
      ? <strong key={`${keyPrefix}-${match.index}`}>{renderInline(content, `${keyPrefix}-${match.index}`)}</strong>
      : <em key={`${keyPrefix}-${match.index}`}>{renderInline(content, `${keyPrefix}-${match.index}`)}</em>);
    start = match.index + token.length;
  }
  if (start < value.length) nodes.push(value.slice(start));
  return nodes;
}

export default function RichTextContent({ value, className = '' }: { value: string; className?: string }) {
  const lines = value.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const unordered = /^\s*[-*+]\s+/.test(line);
    const ordered = /^\s*\d+\.\s+/.test(line);
    if (unordered || ordered) {
      const items: string[] = [];
      while (index < lines.length && listPrefix.test(lines[index])) {
        items.push(lines[index].replace(listPrefix, ''));
        index += 1;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={`list-${index}`} className={unordered ? 'list-disc pl-5' : 'list-decimal pl-5'}>
        {items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `list-${index}-${itemIndex}`)}</li>)}
      </List>);
      continue;
    }
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim()
      && !/^\s*[-*+]\s+/.test(lines[index]) && !/^\s*\d+\.\s+/.test(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{paragraph.map((text, lineIndex) => <Fragment key={lineIndex}>
      {lineIndex > 0 && <br />}{renderInline(text, `paragraph-${index}-${lineIndex}`)}
    </Fragment>)}</p>);
  }
  return <div className={className}>{blocks}</div>;
}
