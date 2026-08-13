'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Database } from '@/core/supabase/types';
import type { StoredPlayer } from '@/core/gameModes/clientTypes';
import Timer from '@/core/components/Timer';

type Room = Database['public']['Tables']['rooms']['Row'];

interface TriviaState {
  session: { currentIndex: number; phase: 'question' | 'reveal'; questionDeadline: string | null } | null;
  question: { id: string; question: string; options: string[]; timeLimitSeconds: number } | null;
  reveal: { correctIndex: number; explanation: string } | null;
}

export default function TriviaPlayerView({ room, player }: { room: Room; player: StoredPlayer }) {
  const [state, setState] = useState<TriviaState | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; explanation: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [alreadyAnswered, setAlreadyAnswered] = useState(false);

  const loadState = useCallback(async () => {
    const res = await fetch(`/api/rooms/${room.pin}/trivia/state`);
    // Keep the last good state on a failed response: an error body has no
    // `question`, so storing it would blank the screen and look like the round
    // ended, with nothing to recover from until the next realtime event.
    if (!res.ok) return;
    const data: TriviaState = await res.json();
    setState((previous) => {
      if (previous?.question?.id !== data.question?.id) {
        setFeedback(null);
        setAlreadyAnswered(false);
      }
      return data;
    });
  }, [room.pin]);

  useEffect(() => {
    // Runs whenever the parent page re-renders `room` after a realtime event
    // — same idiom as EscapeRoomPlayerView.loadCurrentChallenge.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadState();
  }, [loadState, room]);

  async function handleOptionClick(event: React.MouseEvent<HTMLButtonElement>) {
    await handleAnswer(Number(event.currentTarget.dataset.index));
  }

  async function handleAnswer(index: number) {
    if (!state?.question) return;
    setSubmitting(true);
    try {
      // No timeTakenMs: the server derives elapsed time from the deadline it set
      // itself. A client-reported stopwatch was trivially forgeable for points.
      const res = await fetch(`/api/rooms/${room.pin}/trivia/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: player.playerId,
          clientToken: player.clientToken,
          questionId: state.question.id,
          index,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setAlreadyAnswered(true);
        return;
      }
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

  if (!state?.question) {
    return <p className="flex flex-1 items-center justify-center text-muted">Loading question...</p>;
  }

  const { question, session } = state;
  const answered = !!feedback || alreadyAnswered;
  const waitingForReveal = answered && session?.phase === 'question';

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex justify-center">
        <Timer deadline={session?.questionDeadline ?? null} />
      </div>
      <p className="text-center text-lg font-semibold text-foreground">{question.question}</p>

      {answered ? (
        <>
          {waitingForReveal && (
            <p className="text-center text-muted">Answer submitted. Waiting for the others...</p>
          )}
          {alreadyAnswered && !feedback && (
            <p className="text-center text-muted">You already answered this question.</p>
          )}
          {feedback && (
            <p
              role="status"
              className={`rounded-xl px-4 py-3 text-center text-sm font-medium ${
                feedback.correct ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
              }`}
            >
              {feedback.correct ? 'Correct ✅' : 'Incorrect ❌'}
              {feedback.explanation ? ` — ${feedback.explanation}` : ''}
            </p>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {question.options.map((option, index) => (
            <button
              key={option}
              type="button"
              data-index={index}
              onClick={handleOptionClick}
              disabled={submitting}
              className="rounded-xl border-2 border-border bg-background px-4 py-4 font-semibold text-foreground transition hover:border-brand hover:bg-brand/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
