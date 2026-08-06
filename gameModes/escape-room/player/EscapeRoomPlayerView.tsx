'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/core/supabase/client';
import type { Database } from '@/core/supabase/types';
import type { StoredPlayer } from '@/core/gameModes/clientTypes';
import Timer from '@/core/components/Timer';
import { getChallengeComponent } from '../challenges/registry';
import type { ChallengePrompt, ChallengeAnswer } from '../challenges/types';

type Room = Database['public']['Tables']['rooms']['Row'];
type Session = Database['public']['Tables']['escape_room_sessions']['Row'];
type ChallengeRow = Database['public']['Views']['escape_room_challenges_public']['Row'];

export default function EscapeRoomPlayerView({
  room,
  player,
}: {
  room: Room;
  player: StoredPlayer;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [challenge, setChallenge] = useState<ChallengeRow | null>(null);
  const [team, setTeam] = useState<Session['team']>('');
  const [feedback, setFeedback] = useState<{ correct: boolean; explanation: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set for real in loadCurrentChallenge (an effect) whenever the challenge
  // id changes — 0 here is just a placeholder, never Date.now() at render
  // time (that would be an impure render call).
  const challengeStartRef = useRef<number>(0);

  const loadCurrentChallenge = useCallback(async () => {
    let playerTeam: Session['team'] = '';
    if (room.play_style === 'teams') {
      const { data: playerRow } = await supabase
        .from('players')
        .select('team')
        .eq('id', player.playerId)
        .maybeSingle();
      playerTeam = playerRow?.team ?? '';
    }
    setTeam(playerTeam);

    const { data: sessionRow } = await supabase
      .from('escape_room_sessions')
      .select()
      .eq('room_id', room.id)
      .eq('team', playerTeam)
      .maybeSingle();
    setSession(sessionRow ?? null);

    if (sessionRow?.current_challenge_id) {
      const { data: challengeRow } = await supabase
        .from('escape_room_challenges_public')
        .select()
        .eq('id', sessionRow.current_challenge_id)
        .maybeSingle();
      setChallenge((previous) => {
        if (previous?.id !== challengeRow?.id) {
          setFeedback(null);
          challengeStartRef.current = Date.now();
        }
        return challengeRow ?? null;
      });
    } else {
      setChallenge(null);
    }
  }, [room.id, room.play_style, player.playerId]);

  useEffect(() => {
    // Runs whenever the parent page re-renders `room` after a realtime
    // event (new object reference on every fetch) — this is how a solved
    // challenge propagates into "load whatever the next one is".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCurrentChallenge();
  }, [loadCurrentChallenge, room]);

  async function handleAnswer(answer: ChallengeAnswer) {
    if (!challenge) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rooms/${room.pin}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: player.playerId,
          clientToken: player.clientToken,
          team,
          challengeId: challenge.id,
          answer,
          timeTakenMs: Date.now() - challengeStartRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not submit the answer');
      setFeedback({ correct: data.correct, explanation: data.explanation ?? '' });
    } catch (err) {
      setFeedback({
        correct: false,
        explanation: err instanceof Error ? err.message : 'Could not submit the answer',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (session?.finished_at) {
    return (
      <p className="flex flex-1 items-center justify-center text-center font-display text-2xl font-bold text-success">
        Your team finished the escape room! 🎉
      </p>
    );
  }

  if (!challenge) {
    return <p className="flex flex-1 items-center justify-center text-muted">Loading challenge...</p>;
  }

  const ChallengeInput = getChallengeComponent(challenge.challenge_type);

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex justify-center">
        <Timer deadline={session?.challenge_deadline ?? null} />
      </div>
      <div className="rounded-2xl bg-surface border border-border p-5">
        {/* Registry lookup, not component creation: getChallengeComponent
            always returns one of 5 stable, module-level component references
            keyed by challenge_type — the linter can't statically tell that
            apart from defining a new component during render. */}
        {/* eslint-disable-next-line react-hooks/static-components */}
        <ChallengeInput
          prompt={challenge.prompt_display as ChallengePrompt}
          onSubmit={handleAnswer}
          disabled={submitting}
        />
      </div>
      {feedback && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            feedback.correct ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
          }`}
        >
          {feedback.correct ? 'Correct ✅' : 'Incorrect ❌'}
          {feedback.explanation ? ` — ${feedback.explanation}` : ''}
        </p>
      )}
    </div>
  );
}
