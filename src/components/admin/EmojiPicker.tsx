const emojis = [
  ['❤️', 'Red heart'], ['😍', 'Heart eyes'], ['🥰', 'Smiling face with hearts'],
  ['😊', 'Smiling face'], ['✨', 'Sparkles'], ['🌸', 'Cherry blossom'],
  ['💕', 'Two hearts'], ['👍', 'Thumbs up'], ['🙏', 'Folded hands'],
  ['🎉', 'Party popper'],
] as const;

export default function EmojiPicker({ label, onSelect, disabled = false }: {
  label: string;
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}) {
  return <details className="mt-2">
    <summary className={`min-h-11 cursor-pointer text-sm font-semibold ${disabled ? 'pointer-events-none opacity-50' : ''}`}>{label}</summary>
    <p className="mb-2 text-xs text-cocoa/70">Insert at the cursor. You can also paste any emoji.</p>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Emoji options">
      {emojis.map(([emoji, name]) => <button key={name} type="button" aria-label={`Insert ${name}`}
        disabled={disabled}
        className="min-h-11 min-w-11 rounded-lg border border-cocoa/20 bg-white p-2 text-xl"
        onMouseDown={event => event.preventDefault()} onClick={() => onSelect(emoji)}>{emoji}</button>)}
    </div>
  </details>;
}
