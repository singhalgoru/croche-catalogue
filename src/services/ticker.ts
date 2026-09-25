import { supabase } from '../lib/supabase';
import type { TickerMessage } from '../types/ticker';

interface TickerMessageRow {
  id: string;
  message: string;
  is_active: boolean;
  sort_order: number;
}

const COLUMNS = 'id, message, is_active, sort_order';

const requireSupabase = () => {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
};

const mapTickerMessage = (row: TickerMessageRow): TickerMessage => ({
  id: row.id,
  message: row.message,
  isActive: row.is_active,
  sortOrder: row.sort_order,
});

export async function fetchActiveTickerMessages(): Promise<TickerMessage[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('ticker_messages')
    .select(COLUMNS)
    .eq('is_active', true)
    .order('sort_order')
    .order('created_at');
  if (error) throw new Error(`Unable to load ticker messages: ${error.message}`);
  return (data as TickerMessageRow[]).map(mapTickerMessage);
}

export async function fetchAdminTickerMessages(): Promise<TickerMessage[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('ticker_messages')
    .select(COLUMNS)
    .order('sort_order')
    .order('created_at');
  if (error) throw new Error(`Unable to load ticker messages: ${error.message}`);
  return (data as TickerMessageRow[]).map(mapTickerMessage);
}

export async function createTickerMessage(message: string): Promise<void> {
  const client = requireSupabase();
  const existing = await fetchAdminTickerMessages();
  const { error } = await client.from('ticker_messages').insert({
    message: message.trim(),
    is_active: true,
    sort_order: existing.length,
  });
  if (error) throw new Error(`Unable to add the ticker message: ${error.message}`);
}

export async function updateTickerMessage(
  id: string,
  changes: { message?: string; isActive?: boolean },
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('ticker_messages')
    .update({
      ...(changes.message !== undefined ? { message: changes.message.trim() } : {}),
      ...(changes.isActive !== undefined ? { is_active: changes.isActive } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`Unable to update the ticker message: ${error.message}`);
}

export async function deleteTickerMessage(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('ticker_messages').delete().eq('id', id);
  if (error) throw new Error(`Unable to delete the ticker message: ${error.message}`);
}

export async function reorderTickerMessages(messages: TickerMessage[]): Promise<void> {
  const client = requireSupabase();
  for (const [sortOrder, message] of messages.entries()) {
    const { error } = await client
      .from('ticker_messages')
      .update({ sort_order: sortOrder, updated_at: new Date().toISOString() })
      .eq('id', message.id);
    if (error) throw new Error(`Unable to reorder ticker messages: ${error.message}`);
  }
}
