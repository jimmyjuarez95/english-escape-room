import { NextResponse } from 'next/server';
import { getActiveRoomByPin } from '@/core/rooms/roomService';
import { verifyPlayerInRoom } from '@/core/players/playerService';
import { createServiceRoleClient } from '@/core/supabase/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pin: string }> }
) {
  const { pin } = await params;
  const body = await request.json().catch(() => null);
  const playerId = body?.playerId;
  const clientToken = body?.clientToken;
  const challengeId = body?.challengeId;
  const answer = body?.answer;

  if (
    typeof playerId !== 'string' ||
    typeof clientToken !== 'string' ||
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

  // The team comes back from the same lookup that authenticates the player, so
  // it can no longer be chosen in the request body — sending the other team's
  // letter used to let a player drive that team's session.
  const { ok, team } = await verifyPlayerInRoom(room.id, playerId, clientToken);
  if (!ok) {
    return NextResponse.json({ error: 'Invalid player credentials' }, { status: 403 });
  }

  const supabase = createServiceRoleClient();
  // No p_time_taken_ms: since 004 the elapsed time is derived server-side from
  // the deadline. It used to be taken from the client, where a negative value
  // minted arbitrary points.
  const { data: result, error } = await supabase.rpc('submit_answer', {
    p_room_id: room.id,
    p_player_id: playerId,
    p_team: team,
    p_challenge_id: challengeId,
    p_answer: answer,
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
