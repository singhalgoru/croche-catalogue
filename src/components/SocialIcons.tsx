interface IconProps {
  className?: string;
}

export function WhatsAppIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12.04 2a9.84 9.84 0 0 0-8.4 14.96L2 22l5.2-1.62A9.94 9.94 0 1 0 12.04 2Zm0 17.9a8 8 0 0 1-4.08-1.12l-.3-.18-3.08.96 1-3-.2-.31A7.95 7.95 0 1 1 12.04 19.9Zm4.38-5.96c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.93-1.19a7.23 7.23 0 0 1-1.33-1.65c-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.59 4.12 3.63.58.25 1.03.4 1.38.51.58.18 1.1.16 1.52.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  );
}

export function InstagramIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M14 8.5V7c0-.8.5-1 1-1h2V2.2A27 27 0 0 0 14.1 2C11.2 2 9 3.8 9 7.2v1.3H6V13h3v9h4.5v-9h3.1l.5-4.5H14Z" />
    </svg>
  );
}

export function SnapchatIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.2c-2.9 0-4.5 2.2-4.5 5.1 0 1-.1 1.8-.5 2.5-.5.8-1.3 1.1-2.2 1.5-.5.2-.5.9 0 1.1.7.3 1.5.5 2.2.6.4 1.2 1.4 1.9 2.8 2.1.5.1.8.7 1 1.2.2.5.6.8 1.2.8s1-.3 1.2-.8c.2-.5.5-1.1 1-1.2 1.4-.2 2.4-.9 2.8-2.1.7-.1 1.5-.3 2.2-.6.5-.2.5-.9 0-1.1-.9-.4-1.7-.7-2.2-1.5-.4-.7-.5-1.5-.5-2.5 0-2.9-1.6-5.1-4.5-5.1Z" />
    </svg>
  );
}

export function RedditIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="14" r="6.5" />
      <circle cx="9.5" cy="13" r=".8" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13" r=".8" fill="currentColor" stroke="none" />
      <path d="M9.5 16c1.5 1 3.5 1 5 0M12 7.5l1-4 3.2.7" />
      <circle cx="17.5" cy="4.5" r="1.5" />
      <circle cx="5" cy="11" r="1.5" />
      <circle cx="19" cy="11" r="1.5" />
    </svg>
  );
}

export function ShareIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
    </svg>
  );
}

export function CopyIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}
