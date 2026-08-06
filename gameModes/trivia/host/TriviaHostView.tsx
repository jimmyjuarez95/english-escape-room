'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Database } from '@/core/supabase/types';
import Timer from '@/core/components/Timer';

type Room = Database['public']['Tables']['rooms']['Row'];
type Player = Database['public']['Tables']['players']['Row'];

interface TriviaState {
  session: { currentIndex: number; phase: 'question' | 'reveal'; questionDeadline: string | null } | null;
  question: { id: string; question: string; options: string[]; timeLimitSeconds: number } | null;
  reveal: { correctIndex: number; explanation: string } | null;
}

interface StoredHost {
  roomId: string;
  hostSecret: string;
}

export default function TriviaHostView({ room, players }: { room: Room; players: Player[] }) {
  const [state, setState] = useState<TriviaState | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const loadState = useCallback(async () => {
    const res = await fetch(`/api/rooms/${room.pin}/trivia/state`);
    const data = await res.json();
    setState(data);
  }, [room.pin]);

  useEffect(() => {
    // Same fetch-on-realtime-signal idiom as EscapeRoomHostView.loadSessions:
    // `room` gets a new reference whenever useRoomChannel's onChange refetches
    // it, which is how a host-triggered /advance propagates here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadState();
  }, [loadState, room]);

  async function handleAdvance() {
    const raw = localStorage.getItem(`host:${room.pin}`);
    const stored: StoredHost | null = raw ? JSON.parse(raw) : null;
    if (!stored) return;

    setAdvancing(true);
    try {
      await fetch(`/api/rooms/${room.pin}/trivia/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostSecret: stored.hostSecret }),
      });
      await loadState();
    } finally {
      setAdvancing(false);
    }
  }

  if (!state?.question) {
    return <p className="flex flex-1 items-center justify-center text-muted">Loading question...</p>;
  }

  const { question, reveal, session } = state;
  const scoreboard = [...players].sort((a, b) => b.score - a.score).slice(0, 5);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-surface border border-border p-8">
        <Timer deadline={session?.questionDeadline ?? null} />
        <p className="text-center font-display text-2xl font-extrabold text-foreground sm:text-3xl">
          {question.question}
        </p>
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          {question.options.map((option, index) => {
            const isCorrect = reveal && index === reveal.correctIndex;
            return (
              <div
                key={option}
                className={`rounded-xl border-2 px-4 py-3 text-center font-semibold ${
                  isCorrect
                    ? 'border-success bg-success/10 text-success'
                    : 'border-border bg-background text-foreground'
                }`}
              >
                {option}
              </div>
            );
          })}
        </div>
        {reveal && <p className="text-center text-muted">{reveal.explanation}</p>}
        <button
          onClick={handleAdvance}
          disabled={advancing}
          className="rounded-xl bg-brand px-6 py-3 font-display font-bold text-brand-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {session?.phase === 'question' ? 'Reveal answer' : 'Next question ➡️'}
        </button>
      </div>

      {scoreboard.length > 0 && (
        <div className="rounded-2xl bg-surface border border-border p-5">
          <p className="font-display text-sm font-bold uppercase tracking-wide text-muted">Top scores</p>
          <ol className="mt-3 space-y-1">
            {scoreboard.map((player) => (
              <li key={player.id} className="flex items-center justify-between text-foreground">
                <span className="font-semibold">{player.name}</span>
                <span className="font-display font-extrabold text-brand">{player.score} pts</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
