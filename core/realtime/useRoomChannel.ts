'use client';

import { useEffect } from 'react';
import { supabase } from '../supabase/client';

/**
 * Subscribes to every table a room's state can change on (rooms, players,
 * escape_room_sessions, trivia_sessions, impostor_rounds — the same tables
 * added to the supabase_realtime publication in schema.sql) and calls
 * `onChange` for any insert/update/delete. Callers still do their own
 * `select` to read the actual new state; this hook only tells them *when* to
 * re-fetch, once, no matter which table changed.
 *
 * Only ever subscribed once a roomId is known — pass null while it's still
 * loading and the hook no-ops.
 */
export function useRoomChannel(roomId: string | null, onChange: () => void) {
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        onChange
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        onChange
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'escape_room_sessions',
          filter: `room_id=eq.${roomId}`,
        },
        onChange
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trivia_sessions',
          filter: `room_id=eq.${roomId}`,
        },
        onChange
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'impostor_rounds',
          filter: `room_id=eq.${roomId}`,
        },
        onChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, onChange]);
}
