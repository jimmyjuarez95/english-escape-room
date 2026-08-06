import { NextResponse } from 'next/server';
import { getActiveRoomByPin } from '@/core/rooms/roomService';
import { verifyClientToken } from '@/core/players/playerService';
import { createServiceRoleClient } from '@/core/supabase/server';

const UNIQUE_VIOLATION = '23505';

export async function POST(request: Request, { params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  const body = await request.json().catch(() => null);
  const playerId = body?.playerId;
  const clientToken = body?.clientToken;
  const questionId = body?.questionId;
  const index = body?.index;
  const timeTakenMs = body?.timeTakenMs;

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

  const isPlayer = await verifyClientToken(playerId, clientToken);
  if (!isPlayer) {
    return NextResponse.json({ error: 'Invalid player credentials' }, { status: 403 });
  }

  const supabase = createServiceRoleClient();
  const { data: questionRow, error: questionError } = await supabase
    .from('trivia_questions')
    .select('correct_index, explanation, grammar_point')
    .eq('id', questionId)
    .maybeSingle();
  if (questionError) throw questionError;
  if (!questionRow) {
    return NextResponse.json({ error: 'Unknown question' }, { status: 404 });
  }

  const isCorrect = index === questionRow.correct_index;

  const { error: attemptError } = await supabase.from('attempts').insert({
    room_id: room.id,
    player_id: playerId,
    game_mode: 'trivia',
    trivia_question_id: questionId,
    is_correct: isCorrect,
    answer_payload: { index },
    grammar_point: questionRow.grammar_point,
    time_taken_ms: typeof timeTakenMs === 'number' ? timeTakenMs : null,
  });
  if (attemptError) {
    if (attemptError.code === UNIQUE_VIOLATION) {
      return NextResponse.json({ error: 'You already answered this question' }, { status: 409 });
    }
    throw attemptError;
  }

  if (isCorrect) {
    const points = 100 + Math.max(0, 50 - Math.round((typeof timeTakenMs === 'number' ? timeTakenMs : 60000) / 1000));
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('score')
      .eq('id', playerId)
      .single();
    if (playerError) throw playerError;
    const { error: scoreError } = await supabase
      .from('players')
      .update({ score: player.score + points })
      .eq('id', playerId);
    if (scoreError) throw scoreError;
  }

  return NextResponse.json({ correct: isCorrect, explanation: questionRow.explanation });
}
