import { NextResponse } from 'next/server';
import { getActiveRoomByPin } from '@/core/rooms/roomService';
import { verifyClientToken } from '@/core/players/playerService';
import { createServiceRoleClient } from '@/core/supabase/server';

// The only way a client learns its role — never a direct table read, which
// is why impostor_round_secrets carries no anon policy at all. POST (not
// GET) so clientToken never ends up in a URL/query string or server log.
export async function POST(request: Request, { params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  const body = await request.json().catch(() => null);
  const playerId = body?.playerId;
  const clientToken = body?.clientToken;

  if (typeof playerId !== 'string' || typeof clientToken !== 'string') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const room = await getActiveRoomByPin(pin);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  const isPlayer = await verifyClientToken(playerId, clientToken);
  if (!isPlayer) {
    return NextResponse.json({ error: 'Invalid player credentials' }, { status: 403 });
  }

  const supabase = createServiceRoleClient();
  const { data: round, error: roundError } = await supabase
    .from('impostor_rounds')
    .select('round_index, phase')
    .eq('room_id', room.id)
    .order('round_index', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (roundError) throw roundError;
  if (!round) {
    return NextResponse.json({ error: 'No impostor round for this room' }, { status: 409 });
  }

  const { data: secret, error: secretError } = await supabase
    .from('impostor_round_secrets')
    .select('word_id, impostor_player_id')
    .eq('room_id', room.id)
    .eq('round_index', round.round_index)
    .maybeSingle();
  if (secretError) throw secretError;
  if (!secret) {
    return NextResponse.json({ error: 'No round secret found' }, { status: 500 });
  }

  const { data: word, error: wordError } = await supabase
    .from('impostor_words')
    .select('word, category')
    .eq('id', secret.word_id)
    .single();
  if (wordError) throw wordError;

  const isImpostor = secret.impostor_player_id === playerId;

  return NextResponse.json({
    roundIndex: round.round_index,
    phase: round.phase,
    isImpostor,
    category: word.category,
    word: isImpostor ? null : word.word,
  });
}
