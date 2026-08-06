'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/core/supabase/client';
import type { Database } from '@/core/supabase/types';
import Timer from '@/core/components/Timer';
import type { ChallengePrompt } from '../challenges/types';

type Room = Database['public']['Tables']['rooms']['Row'];
type Player = Database['public']['Tables']['players']['Row'];
type Session = Database['public']['Tables']['escape_room_sessions']['Row'];
type ChallengeRow = Database['public']['Views']['escape_room_challenges_public']['Row'];

function describeChallenge(prompt: ChallengePrompt): string {
  switch (prompt.type) {
    case 'fill_blank':
      return prompt.text;
    case 'sentence_correction':
      return `Correct: "${prompt.incorrectSentence}"`;
    case 'vocab_trivia':
      return prompt.question;
    case 'listening':
      return prompt.question;
    case 'speaking':
      return `Say out loud: "${prompt.targetSentence}"`;
  }
}

function SessionPanel({
  session,
  challenge,
  players,
  showTeamLabel,
}: {
  session: Session;
  challenge: ChallengeRow | null;
  players: Player[];
  showTeamLabel: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 rounded-3xl bg-surface border border-border p-8">
      {showTeamLabel && (
        <h2 className="font-display text-xl font-extrabold text-brand">Team {session.team}</h2>
      )}
      <p className="text-sm text-muted">{players.map((p) => p.name).join(', ') || '—'}</p>

      {session.finished_at ? (
        <p className="font-display text-2xl font-bold text-success">
          You finished the escape room! 🎉
        </p>
      ) : challenge ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <Timer deadline={session.challenge_deadline} />
          <p className="font-display text-3xl font-extrabold text-foreground sm:text-4xl">
            {describeChallenge(challenge.prompt_display as ChallengePrompt)}
          </p>
        </div>
      ) : (
        <p className="text-muted">Loading challenge...</p>
      )}
    </div>
  );
}

export default function EscapeRoomHostView({ room, players }: { room: Room; players: Player[] }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [challengesById, setChallengesById] = useState<Record<string, ChallengeRow>>({});

  const loadSessions = useCallback(async () => {
    const { data: sessionRows } = await supabase
      .from('escape_room_sessions')
      .select()
      .eq('room_id', room.id);
    setSessions(sessionRows ?? []);

    const challengeIds = (sessionRows ?? [])
      .map((s) => s.current_challenge_id)
      .filter((id): id is string => !!id);
    if (challengeIds.length === 0) {
      setChallengesById({});
      return;
    }

    const { data: challengeRows } = await supabase
      .from('escape_room_challenges_public')
      .select()
      .in('id', challengeIds);
    setChallengesById(Object.fromEntries((challengeRows ?? []).map((c) => [c.id, c])));
  }, [room.id]);

  useEffect(() => {
    // See EscapeRoomPlayerView for why this effect intentionally fires
    // setState synchronously: it's the realtime-driven refetch, not an
    // accidental cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSessions();
  }, [loadSessions, room]);

  const showTeamLabel = room.play_style === 'teams';

  return (
    <div className="flex flex-1 flex-col gap-6 sm:flex-row">
      {sessions.map((session) => (
        <SessionPanel
          key={session.team}
          session={session}
          challenge={session.current_challenge_id ? (challengesById[session.current_challenge_id] ?? null) : null}
          players={showTeamLabel ? players.filter((p) => p.team === session.team) : players}
          showTeamLabel={showTeamLabel}
        />
      ))}
    </div>
  );
}
