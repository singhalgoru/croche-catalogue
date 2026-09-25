import { useEffect, useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchActiveTickerMessages } from '../services/ticker';

const FALLBACK_MESSAGE = '🚚 Shipping available across India';

export function useTickerMessages(enabled = true) {
  const [messages, setMessages] = useState<string[]>([FALLBACK_MESSAGE]);

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) return;
    let isCurrent = true;
    void fetchActiveTickerMessages().then(
      (activeMessages) => {
        if (!isCurrent) return;
        setMessages(
          activeMessages.length > 0
            ? activeMessages.map((message) => message.message)
            : [FALLBACK_MESSAGE],
        );
      },
      () => {
        if (isCurrent) setMessages([FALLBACK_MESSAGE]);
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [enabled]);

  return messages;
}
