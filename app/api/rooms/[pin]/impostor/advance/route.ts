import { NextResponse } from 'next/server';
import { getActiveRoomByPin, verifyHostSecret } from '@/core/rooms/roomService';
import { createServiceRoleClient } from '@/core/supabase/server';

const CAUGHT_VOTER_POINTS = 100;
const IMPOSTOR_EVADED_POINTS = 150;

async function awardPoints(
  supabase: ReturnType<typeof createServiceRoleClient>,
  playerId: string,
  points: number
) {
  const { data: player, error } = await supabase.from('players').select('score').eq('id', playerId).single();
  if (error) throw error;
  const { error: updateError } = await supabase
    .from('players')
    .update({ score: player.score + points })
    .eq('id', playerId);
  if (updateError) throw updateError;
}

// Host-paced state machine, each transition a conditional update keyed on
// the phase it expects (no-ops harmlessly on a double-tap):
// discussion -> voting -> reveal (tally + score) -> next round or finish.
export async function POST(request: Request, { params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  const body = await request.json().catch(() => null);
  const hostSecret = body?.hostSecret;

  if (typeof hostSecret !== 'string') {
    return NextResponse.json({ error: 'hostSecret is required' }, { status: 400 });
  }

  const room = await getActiveRoomByPin(pin);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }
  if (room.status !== 'in_progress') {
    return NextResponse.json({ error: 'This room is not in progress' }, { status: 409 });
  }

  const isHost = await verifyHostSecret(room.id, hostSecret);
  if (!isHost) {
    return NextResponse.json({ error: 'Invalid host secret' }, { status: 403 });
  }

  const supabase = createServiceRoleClient();
  const { data: round, error: roundError } = await supabase
    .from('impostor_rounds')
    .select()
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
    .select('track_id, word_id, impostor_player_id')
    .eq('room_id', room.id)
    .eq('round_index', round.round_index)
    .maybeSingle();
  if (secretError) throw secretError;
  if (!secret) {
    return NextResponse.json({ error: 'No round secret found' }, { status: 500 });
  }

  if (round.phase === 'discussion') {
    const { data: word, error: wordError } = await supabase
      .from('impostor_words')
      .select('voting_seconds')
      .eq('id', secret.word_id)
      .single();
    if (wordError) throw wordError;

    const deadline = new Date(Date.now() + word.voting_seconds * 1000).toISOString();
    const { error } = await supabase
      .from('impostor_rounds')
      .update({ phase: 'voting', phase_deadline: deadline })
      .eq('room_id', room.id)
      .eq('round_index', round.round_index)
      .eq('phase', 'discussion');
    if (error) throw error;
    return NextResponse.json({ ok: true });
  }

  if (round.phase === 'voting') {
    const { data: votes, error: votesError } = await supabase
      .from('impostor_votes')
      .select('voter_player_id, voted_player_id')
      .eq('room_id', room.id)
      .eq('round_index', round.round_index);
    if (votesError) throw votesError;

    const tally = new Map<string, number>();
    for (const vote of votes ?? []) {
      tally.set(vote.voted_player_id, (tally.get(vote.voted_player_id) ?? 0) + 1);
    }
    const topCount = Math.max(0, ...tally.values());
    const topPlayers = [...tally.entries()].filter(([, count]) => count === topCount);
    const caught = topPlayers.length === 1 && topPlayers[0][0] === secret.impostor_player_id;

    if (caught) {
      const correctVoters = (votes ?? []).filter((v) => v.voted_player_id === secret.impostor_player_id);
      for (const voter of correctVoters) {
        await awardPoints(supabase, voter.voter_player_id, CAUGHT_VOTER_POINTS);
      }
    } else {
      await awardPoints(supabase, secret.impostor_player_id, IMPOSTOR_EVADED_POINTS);
    }

    const { error } = await supabase
      .from('impostor_rounds')
      .update({ phase: 'reveal', finished_at: new Date().toISOString() })
      .eq('room_id', room.id)
      .eq('round_index', round.round_index)
      .eq('phase', 'voting');
    if (error) throw error;
    return NextResponse.json({ ok: true });
  }

  // phase === 'reveal' -> advance to the next round, or finish the room.
  // word_sequence is the short, randomly-sampled subset of the (much larger)
  // track chosen once at onStart — see gameModes/impostor/session.ts — so
  // "next word" is an array lookup, not a query by order_index.
  const { data: session, error: sessionError } = await supabase
    .from('impostor_sessions')
    .select('word_sequence')
    .eq('room_id', room.id)
    .single();
  if (sessionError) throw sessionError;

  const nextWordId = session.word_sequence[round.round_index + 1];
  const { data: nextWord, error: nextWordError } = nextWordId
    ? await supabase
        .from('impostor_words')
        .select('id, discussion_seconds')
        .eq('id', nextWordId)
        .maybeSingle()
    : { data: null, error: null };
  if (nextWordError) throw nextWordError;

  if (nextWord) {
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', room.id);
    if (playersError) throw playersError;
    if (!players || players.length === 0) throw new Error('No players left in this room');

    const impostor = players[Math.floor(Math.random() * players.length)];
    const nextRoundIndex = round.round_index + 1;
    const deadline = new Date(Date.now() + nextWord.discussion_seconds * 1000).toISOString();

    const { error: nextRoundError } = await supabase.from('impostor_rounds').insert({
      room_id: room.id,
      round_index: nextRoundIndex,
      phase: 'discussion',
      phase_deadline: deadline,
    });
    if (nextRoundError) throw nextRoundError;

    const { error: nextSecretError } = await supabase.from('impostor_round_secrets').insert({
      room_id: room.id,
      round_index: nextRoundIndex,
      track_id: secret.track_id,
      word_id: nextWord.id,
      impostor_player_id: impostor.id,
    });
    if (nextSecretError) throw nextSecretError;
  } else {
    const { error: roomError } = await supabase
      .from('rooms')
      .update({ status: 'finished', finished_at: new Date().toISOString() })
      .eq('id', room.id);
    if (roomError) throw roomError;
  }

  return NextResponse.json({ ok: true });
}
