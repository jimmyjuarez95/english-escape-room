'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/core/supabase/client';
import type { Database } from '@/core/supabase/types';
import { useRoomChannel } from '@/core/realtime/useRoomChannel';
import { getClientGameMode } from '@/core/gameModes/clientRegistry';
import type { StoredPlayer } from '@/core/gameModes/clientTypes';
import { useRoomResults } from '@/core/results/useRoomResults';
import '@/gameModes/client';
import ResultsScreen from '@/core/components/ResultsScreen';
import Footer from '@/core/components/Footer';

type Room = Database['public']['Tables']['rooms']['Row'];

export default function PlayRoomPage() {
  const { pin } = useParams<{ pin: string }>();
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [player, setPlayer] = useState<StoredPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  // See app/host/[pin]/page.tsx for why this switches to an id lookup once
  // known — otherwise a finished room stops matching its own pin query.
  const roomIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const { data: roomData, error: roomError } = roomIdRef.current
      ? await supabase.from('rooms').select().eq('id', roomIdRef.current).maybeSingle()
      : await supabase.from('rooms').select().eq('pin', pin).neq('status', 'finished').maybeSingle();

    if (roomError || !roomData) {
      setError('Esta sala ya no está activa.');
      return;
    }
    roomIdRef.current = roomData.id;
    setRoom(roomData);
  }, [pin]);

  useEffect(() => {
    // localStorage only exists client-side, so this must run post-mount, not
    // during render — the state update here is what lets a page that starts
    // as "Cargando..." on the server pick up the stored player after hydration.
    const raw = localStorage.getItem(`player:${pin}`);
    if (!raw) {
      router.replace(`/play?pin=${pin}`);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlayer(JSON.parse(raw));
    refresh();
  }, [pin, refresh, router]);

  useRoomChannel(room?.id ?? null, refresh);
  const results = useRoomResults(pin, room?.status === 'finished');

  if (error) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <p role="alert" className="rounded-xl bg-error/10 px-6 py-4 text-center text-error">
          {error}
        </p>
      </main>
    );
  }

  if (!room || !player) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-muted">Cargando...</p>
      </main>
    );
  }

  if (room.status === 'in_progress') {
    const mode = getClientGameMode(room.game_mode);
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
        {mode ? (
          <mode.PlayerView room={room} player={player} />
        ) : (
          <p className="text-error">Modo de juego desconocido.</p>
        )}
        <Footer />
      </main>
    );
  }

  if (room.status === 'finished') {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
        {results ? <ResultsScreen results={results} /> : <p className="text-muted">Cargando resultados...</p>}
        <Footer />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <p className="text-lg">
        Hola, <span className="font-display font-bold text-brand">{player.name}</span> 👋
      </p>
      <div className="rounded-2xl bg-surface border border-border px-6 py-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">PIN</p>
        <p className="font-display text-3xl font-extrabold tracking-widest text-brand">{room.pin}</p>
      </div>
      <p className="text-muted">Esperando a que el host inicie el juego...</p>
      <button
        onClick={refresh}
        className="rounded-xl border border-border px-6 py-2 text-sm font-semibold text-muted transition hover:text-foreground"
      >
        Refrescar
      </button>
      <Footer />
    </main>
  );
}
