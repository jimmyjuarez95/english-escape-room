'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/core/supabase/client';
import type { Database } from '@/core/supabase/types';
import Timer from '@/core/components/Timer';
import PlayerList from '@/core/components/PlayerList';

type Room = Database['public']['Tables']['rooms']['Row'];
type Player = Database['public']['Tables']['players']['Row'];
type Round = Database['public']['Tables']['impostor_rounds']['Row'];

interface RevealData {
  roundIndex: number;
  word: string;
  category: string;
  impostor: { id: string; name: string };
  tally: { playerId: string; name: string; count: number }[];
  caught: boolean;
}

const PHASE_LABEL: Record<Round['phase'], string> = {
  discussion: 'Describe the word and discuss who the impostor is',
  voting: 'Vote now! Who is the impostor?',
  reveal: 'Round result',
};

const ADVANCE_LABEL: Record<Round['phase'], string> = {
  discussion: 'Open voting',
  voting: 'Reveal result',
  reveal: 'Next round ➡️',
};

interface StoredHost {
  roomId: string;
  hostSecret: string;
}

export default function ImpostorHostView({ room, players }: { room: Room; players: Player[] }) {
  const [round, setRound] = useState<Round | null>(null);
  const [reveal, setReveal] = useState<RevealData | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const loadRound = useCallback(async () => {
    const { data: roundRow } = await supabase
      .from('impostor_rounds')
      .select()
      .eq('room_id', room.id)
      .order('round_index', { ascending: false })
      .limit(1)
      .maybeSingle();
    setRound(roundRow ?? null);

    if (roundRow?.phase === 'reveal') {
      const res = await fetch(`/api/rooms/${room.pin}/impostor/reveal`);
      const data = await res.json();
      setReveal(data.reveal ?? null);
    } else {
      setReveal(null);
    }
  }, [room.id, room.pin]);

  useEffect(() => {
    // Same fetch-on-realtime-signal idiom as TriviaHostView.loadState: `room`
    // gets a new reference whenever useRoomChannel's onChange refetches it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRound();
  }, [loadRound, room]);

  async function handleAdvance() {
    const raw = localStorage.getItem(`host:${room.pin}`);
    const stored: StoredHost | null = raw ? JSON.parse(raw) : null;
    if (!stored) return;

    setAdvancing(true);
    try {
      await fetch(`/api/rooms/${room.pin}/impostor/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostSecret: stored.hostSecret }),
      });
      await loadRound();
    } finally {
      setAdvancing(false);
    }
  }

  if (!round) {
    return <p className="flex flex-1 items-center justify-center text-muted">Loading round...</p>;
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-surface border border-border p-8 text-center">
        <span className="font-display text-sm font-bold uppercase tracking-wide text-muted">
          Round {round.round_index + 1}
        </span>
        <Timer deadline={round.phase === 'reveal' ? null : round.phase_deadline} />
        <p className="font-display text-2xl font-extrabold text-foreground sm:text-3xl">
          {PHASE_LABEL[round.phase]}
        </p>

        {reveal && (
          <div className="flex w-full flex-col gap-3">
            <p className="text-lg text-foreground">
              The word was <span className="font-display font-extrabold text-brand">{reveal.word}</span>{' '}
              ({reveal.category})
            </p>
            <p
              className={`font-display text-xl font-extrabold ${reveal.caught ? 'text-success' : 'text-error'}`}
            >
              {reveal.impostor.name} was the impostor{reveal.caught ? ' and was caught ✅' : ' and got away 🕵️'}
            </p>
            {reveal.tally.length > 0 && (
              <ul className="mx-auto flex flex-col gap-1 text-sm text-muted">
                {reveal.tally.map((t) => (
                  <li key={t.playerId}>
                    {t.name}: {t.count} {t.count === 1 ? 'vote' : 'votes'}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button
          onClick={handleAdvance}
          disabled={advancing}
          className="rounded-xl bg-brand px-6 py-3 font-display font-bold text-brand-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ADVANCE_LABEL[round.phase]}
        </button>
      </div>

      <PlayerList players={players} />
    </div>
  );
}
