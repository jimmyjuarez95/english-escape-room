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
  const roundIndex = body?.roundIndex;
  const votedPlayerId = body?.votedPlayerId;

  if (
    typeof playerId !== 'string' ||
    typeof clientToken !== 'string' ||
    typeof roundIndex !== 'number' ||
    typeof votedPlayerId !== 'string'
  ) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (votedPlayerId === playerId) {
    return NextResponse.json({ error: 'You cannot vote for yourself' }, { status: 400 });
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

  const { data: round, error: roundError } = await supabase
    .from('impostor_rounds')
    .select('phase')
    .eq('room_id', room.id)
    .eq('round_index', roundIndex)
    .maybeSingle();
  if (roundError) throw roundError;
  if (!round || round.phase !== 'voting') {
    return NextResponse.json({ error: 'Voting is not open for this round' }, { status: 409 });
  }

  const { data: votedPlayer, error: votedPlayerError } = await supabase
    .from('players')
    .select('id')
    .eq('id', votedPlayerId)
    .eq('room_id', room.id)
    .maybeSingle();
  if (votedPlayerError) throw votedPlayerError;
  if (!votedPlayer) {
    return NextResponse.json({ error: 'Unknown player' }, { status: 400 });
  }

  const { error: voteError } = await supabase.from('impostor_votes').insert({
    room_id: room.id,
    round_index: roundIndex,
    voter_player_id: playerId,
    voted_player_id: votedPlayerId,
  });
  if (voteError) {
    if (voteError.code === UNIQUE_VIOLATION) {
      return NextResponse.json({ error: 'You already voted this round' }, { status: 409 });
    }
    throw voteError;
  }

  return NextResponse.json({ ok: true });
}
