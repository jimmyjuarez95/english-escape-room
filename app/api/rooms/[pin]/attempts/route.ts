import { NextResponse } from 'next/server';
import { getActiveRoomByPin } from '@/core/rooms/roomService';
import { verifyClientToken } from '@/core/players/playerService';
import { createServiceRoleClient } from '@/core/supabase/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pin: string }> }
) {
  const { pin } = await params;
  const body = await request.json().catch(() => null);
  const playerId = body?.playerId;
  const clientToken = body?.clientToken;
  const team = body?.team;
  const challengeId = body?.challengeId;
  const answer = body?.answer;
  const timeTakenMs = body?.timeTakenMs;

  if (
    typeof playerId !== 'string' ||
    typeof clientToken !== 'string' ||
    typeof team !== 'string' ||
    typeof challengeId !== 'string' ||
    typeof answer !== 'object' ||
    answer === null
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
  const { data: result, error } = await supabase.rpc('submit_answer', {
    p_room_id: room.id,
    p_player_id: playerId,
    p_team: team,
    p_challenge_id: challengeId,
    p_answer: answer,
    p_time_taken_ms: typeof timeTakenMs === 'number' ? timeTakenMs : null,
  });
  if (error) {
    console.error('submit_answer failed', error);
    return NextResponse.json({ error: 'Could not submit answer' }, { status: 500 });
  }

  const { data: challengeRow } = await supabase
    .from('escape_room_challenges')
    .select('explanation')
    .eq('id', challengeId)
    .maybeSingle();

  const parsed = result as { correct: boolean; advanced: boolean };
  return NextResponse.json({
    correct: parsed.correct,
    advanced: parsed.advanced,
    explanation: challengeRow?.explanation ?? null,
  });
}
