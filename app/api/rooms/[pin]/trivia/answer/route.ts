import { NextResponse } from 'next/server';
import { getActiveRoomByPin } from '@/core/rooms/roomService';
import { verifyPlayerInRoom } from '@/core/players/playerService';
import { createServiceRoleClient } from '@/core/supabase/server';

const UNIQUE_VIOLATION = '23505';

export async function POST(request: Request, { params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  const body = await request.json().catch(() => null);
  const playerId = body?.playerId;
  const clientToken = body?.clientToken;
  const questionId = body?.questionId;
  const index = body?.index;

  if (
    typeof playerId !== 'string' ||
    typeof clientToken !== 'string' ||
    typeof questionId !== 'string' ||
    typeof index !== 'number'
  ) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const room = await getActiveRoomByPin(pin);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }
  if (room.status !== 'in_progress') {
    return NextResponse.json({ error: 'This room is not in progress' }, { status: 409 });
  }

  const { ok } = await verifyPlayerInRoom(room.id, playerId, clientToken);
  if (!ok) {
    return NextResponse.json({ error: 'Invalid player credentials' }, { status: 403 });
  }

  const supabase = createServiceRoleClient();

  // Answers are only accepted for the question the room is actually on, while it
  // is still in the 'question' phase. Without this, /trivia/state publishes
  // correctIndex the moment the host reveals, and anyone who had not answered
  // yet could read it there and post it back for full points.
  const { data: session, error: sessionError } = await supabase
    .from('trivia_sessions')
    .select('phase, current_question_id, question_deadline')
    .eq('room_id', room.id)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session || session.phase !== 'question' || session.current_question_id !== questionId) {
    return NextResponse.json({ error: 'This question is no longer open' }, { status: 409 });
  }

  const { data: questionRow, error: questionError } = await supabase
    .from('trivia_questions')
    .select('correct_index, explanation, grammar_point, time_limit_seconds')
    .eq('id', questionId)
    .maybeSingle();
  if (questionError) throw questionError;
  if (!questionRow) {
    return NextResponse.json({ error: 'Unknown question' }, { status: 404 });
  }

  const isCorrect = index === questionRow.correct_index;

  // Elapsed time is derived from the deadline the server set, never taken from
  // the client — a negative timeTakenMs used to be worth thousands of points.
  // Clamped rather than rejected: the host paces the round manually and lets the
  // timer run out routinely, so a late answer still counts, just for the minimum.
  const limitMs = questionRow.time_limit_seconds * 1000;
  const startedAt = session.question_deadline
    ? new Date(session.question_deadline).getTime() - limitMs
    : null;
  const elapsedMs = startedAt
    ? Math.min(limitMs, Math.max(0, Date.now() - startedAt))
    : limitMs;

  const { error: attemptError } = await supabase.from('attempts').insert({
    room_id: room.id,
    player_id: playerId,
    game_mode: 'trivia',
    trivia_question_id: questionId,
    is_correct: isCorrect,
    answer_payload: { index },
    grammar_point: questionRow.grammar_point,
    time_taken_ms: elapsedMs,
  });
  if (attemptError) {
    if (attemptError.code === UNIQUE_VIOLATION) {
      return NextResponse.json({ error: 'You already answered this question' }, { status: 409 });
    }
    throw attemptError;
  }

  if (isCorrect) {
    const points = 100 + Math.max(0, 50 - Math.round(elapsedMs / 1000));
    // Atomic increment: a whole room answers the same question at once, and a
    // read-then-write score update silently drops points under that concurrency.
    const { error: scoreError } = await supabase.rpc('award_points', {
      p_player_id: playerId,
      p_points: points,
    });
    if (scoreError) throw scoreError;
  }

  return NextResponse.json({ correct: isCorrect, explanation: questionRow.explanation });
}
