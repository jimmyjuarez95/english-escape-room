'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/core/supabase/client';
import type { Database } from '@/core/supabase/types';
import type { StoredPlayer } from '@/core/gameModes/clientTypes';
import Timer from '@/core/components/Timer';

type Room = Database['public']['Tables']['rooms']['Row'];
type Player = Database['public']['Tables']['players']['Row'];

interface MeState {
  roundIndex: number;
  phase: 'discussion' | 'voting' | 'reveal';
  isImpostor: boolean;
  category: string;
  word: string | null;
  deadline: string | null;
}

interface RevealData {
  word: string;
  category: string;
  impostor: { id: string; name: string };
  caught: boolean;
}

export default function ImpostorPlayerView({ room, player }: { room: Room; player: StoredPlayer }) {
  const [me, setMe] = useState<MeState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [reveal, setReveal] = useState<RevealData | null>(null);

  const loadMe = useCallback(async () => {
    const [meRes, roundRes, playersRes] = await Promise.all([
      fetch(`/api/rooms/${room.pin}/impostor/me`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.playerId, clientToken: player.clientToken }),
      }).then((res) => res.json()),
      supabase
        .from('impostor_rounds')
        .select('phase_deadline')
        .eq('room_id', room.id)
        .order('round_index', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('players').select().eq('room_id', room.id),
    ]);

    setPlayers(playersRes.data ?? []);
    setMe((previous) => {
      if (previous?.roundIndex !== meRes.roundIndex) {
        setVotedFor(null);
        setVoteError(null);
      }
      return { ...meRes, deadline: roundRes.data?.phase_deadline ?? null };
    });

    if (meRes.phase === 'reveal') {
      const revealRes = await fetch(`/api/rooms/${room.pin}/impostor/reveal`).then((res) => res.json());
      setReveal(revealRes.reveal ?? null);
    } else {
      setReveal(null);
    }
  }, [room.pin, room.id, player.playerId, player.clientToken]);

  useEffect(() => {
    // Same fetch-on-realtime-signal idiom as TriviaPlayerView.loadState:
    // `room` gets a new reference whenever useRoomChannel's onChange refetches it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMe();
  }, [loadMe, room]);

  async function handleVote(votedPlayerId: string) {
    if (!me) return;
    setSubmittingVote(true);
    setVoteError(null);
    try {
      const res = await fetch(`/api/rooms/${room.pin}/impostor/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: player.playerId,
          clientToken: player.clientToken,
          roundIndex: me.roundIndex,
          votedPlayerId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not submit the vote');
      setVotedFor(votedPlayerId);
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : 'Could not submit the vote');
    } finally {
      setSubmittingVote(false);
    }
  }

  if (!me) {
    return <p className="flex flex-1 items-center justify-center text-muted">Loading round...</p>;
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex justify-center">
        <Timer deadline={me.phase === 'reveal' ? null : me.deadline} />
      </div>

      {me.phase === 'discussion' && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface border border-border p-6 text-center">
          {me.isImpostor ? (
            <>
              <p className="font-display text-xl font-extrabold text-error">You are the impostor 🕵️</p>
              <p className="text-muted">Category: {me.category}</p>
              <p className="text-sm text-muted">
                You don&apos;t know the word — describe something generic and try not to get caught.
              </p>
            </>
          ) : (
            <>
              <p className="text-muted">Category: {me.category}</p>
              <p className="font-display text-2xl font-extrabold text-brand">{me.word}</p>
              <p className="text-sm text-muted">Describe it out loud in English, without saying it.</p>
            </>
          )}
        </div>
      )}

      {me.phase === 'voting' &&
        (votedFor ? (
          <p className="text-center text-muted">Vote submitted. Waiting for the others...</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-center font-semibold text-foreground">Who is the impostor?</p>
            {voteError && (
              <p role="alert" className="text-center text-sm text-error">
                {voteError}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {players
                .filter((p) => p.id !== player.playerId)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleVote(p.id)}
                    disabled={submittingVote}
                    className="rounded-xl border-2 border-border bg-background px-4 py-4 font-semibold text-foreground transition hover:border-brand hover:bg-brand/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {p.name}
                  </button>
                ))}
            </div>
          </div>
        ))}

      {me.phase === 'reveal' && reveal && (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface border border-border p-6 text-center">
          <p className="text-lg text-foreground">
            The word was <span className="font-display font-extrabold text-brand">{reveal.word}</span>
          </p>
          <p className={`font-display text-xl font-extrabold ${reveal.caught ? 'text-success' : 'text-error'}`}>
            {reveal.impostor.name} was the impostor{reveal.caught ? ' and was caught ✅' : ' and got away 🕵️'}
          </p>
          {votedFor && (
            <p className="text-sm text-muted">
              {votedFor === reveal.impostor.id ? 'You voted correctly 🎉' : 'Your vote was not correct'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
