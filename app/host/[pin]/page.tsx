'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/core/supabase/client';
import type { Database } from '@/core/supabase/types';
import { useRoomChannel } from '@/core/realtime/useRoomChannel';
import { getClientGameMode } from '@/core/gameModes/clientRegistry';
import { useRoomResults } from '@/core/results/useRoomResults';
import '@/gameModes/client';
import PinDisplay from '@/core/components/PinDisplay';
import PlayerList from '@/core/components/PlayerList';
import ResultsScreen from '@/core/components/ResultsScreen';
import Footer from '@/core/components/Footer';

type Room = Database['public']['Tables']['rooms']['Row'];
type Player = Database['public']['Tables']['players']['Row'];

interface StoredHost {
  roomId: string;
  hostSecret: string;
}

export default function HostRoomPage() {
  const { pin } = useParams<{ pin: string }>();
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // Once resolved, subsequent refreshes look up by id, not by pin: a
  // finished room must keep matching itself here (to show results), but
  // PINs are recycled across finished rooms, so `pin + status<>finished`
  // would go ambiguous or empty the moment this exact room finishes.
  const roomIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const { data: roomData, error: roomError } = roomIdRef.current
      ? await supabase.from('rooms').select().eq('id', roomIdRef.current).maybeSingle()
      : await supabase.from('rooms').select().eq('pin', pin).neq('status', 'finished').maybeSingle();

    if (roomError || !roomData) {
      setError('No active room was found with that PIN.');
      return;
    }
    roomIdRef.current = roomData.id;
    setRoom(roomData);

    const { data: playersData } = await supabase
      .from('players')
      .select()
      .eq('room_id', roomData.id)
      .order('joined_at');
    setPlayers(playersData ?? []);
  }, [pin]);

  useEffect(() => {
    // Fetch-on-mount: the extra render after this resolves is intentional,
    // not a cascading-render bug — there's no client-only data to render
    // before the first fetch completes.
    refresh();
  }, [refresh]);

  useRoomChannel(room?.id ?? null, refresh);
  const results = useRoomResults(pin, room?.status === 'finished');

  async function handleStart() {
    const raw = localStorage.getItem(`host:${pin}`);
    const stored: StoredHost | null = raw ? JSON.parse(raw) : null;
    if (!stored) {
      setError('No host credentials were found for this room in this browser.');
      return;
    }

    setStarting(true);
    try {
      const res = await fetch(`/api/rooms/${pin}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostSecret: stored.hostSecret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start the game');
      setRoom(data.room);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the game');
    } finally {
      setStarting(false);
    }
  }

  if (error) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <p role="alert" className="rounded-xl bg-error/10 px-6 py-4 text-error">
          {error}
        </p>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-muted">Loading room...</p>
      </main>
    );
  }

  if (room.status === 'in_progress') {
    const mode = getClientGameMode(room.game_mode);
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-10">
        {mode ? (
          <mode.HostView room={room} players={players} />
        ) : (
          <p className="text-error">Unknown game mode.</p>
        )}
        <Footer />
      </main>
    );
  }

  if (room.status === 'finished') {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-10">
        {results ? <ResultsScreen results={results} /> : <p className="text-muted">Loading results...</p>}
        <Footer />
      </main>
    );
  }

  // Some modes can't be played below a certain roster (Impostor needs enough
  // people for the deduction to work). Surfaced here as a disabled button with
  // a reason, rather than letting the host find out by pressing Start.
  const minPlayers = getClientGameMode(room.game_mode)?.minPlayers ?? 1;
  const needsMorePlayers = players.length < minPlayers;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-8 px-6 py-12 text-center">
      <PinDisplay pin={room.pin} />

      <div className="flex gap-3">
        <span className="rounded-full bg-surface border border-border px-4 py-1.5 font-semibold text-foreground">
          Level {room.level}
        </span>
        <span className="rounded-full bg-surface border border-border px-4 py-1.5 font-semibold text-foreground">
          {room.play_style === 'teams' ? '⚔️ 2 teams' : '🤝 Collaborative'}
        </span>
      </div>

      <PlayerList players={players} />

      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={handleStart}
          disabled={starting || needsMorePlayers}
          className="rounded-xl bg-brand px-6 py-4 font-display font-bold text-brand-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {starting ? 'Starting...' : 'Start game'}
        </button>
        {needsMorePlayers && (
          <p className="text-sm text-muted">
            This game mode needs at least {minPlayers}{' '}
            {minPlayers === 1 ? 'player' : 'players'} to start.
          </p>
        )}
        <button
          onClick={refresh}
          className="rounded-xl border border-border px-6 py-2 text-sm font-semibold text-muted transition hover:text-foreground"
        >
          Refresh
        </button>
      </div>

      <p className="text-muted">
        Go to <span className="font-semibold text-foreground">/play</span> on your phone and
        enter the PIN to join.
      </p>

      <Footer />
    </main>
  );
}
