import { ShareIcon } from './SocialIcons';

interface Props {
  productName: string;
  onClick: () => void;
  onShareIntent?: () => void;
  className?: string;
  overlay?: boolean;
}

export default function ShareIconButton({
  productName,
  onClick,
  onShareIntent,
  className = '',
  overlay = true,
}: Props) {
  return (
    <div className={`group/share ${overlay ? 'absolute z-20' : 'relative shrink-0'} ${className}`}>
      <button
        type="button"
        onClick={onClick}
        onPointerEnter={onShareIntent}
        onTouchStart={onShareIntent}
        onFocus={onShareIntent}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-cocoa/95 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-cocoa-dark"
        aria-label={`Share ${productName}`}
      >
        <ShareIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
