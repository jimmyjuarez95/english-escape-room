import { NextResponse } from 'next/server';
import { getActiveRoomByPin, verifyHostSecret } from '@/core/rooms/roomService';
import { createServiceRoleClient } from '@/core/supabase/server';
import {
  CAUGHT_VOTER_POINTS,
  IMPOSTOR_EVADED_POINTS,
  IMPOSTOR_MIN_PLAYERS,
  pickImpostorIds,
  resolveRound,
} from '@/gameModes/impostor/rules';

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
    .select('track_id, word_id, impostor_player_ids')
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
    // Flip the phase BEFORE scoring, and score only if this request is the one
    // that flipped it. Scoring first meant two taps on "Reveal result" both saw
    // phase === 'voting' (read once, up at the top) and both paid out, while
    // only one won the conditional update — the state machine no-ops on a
    // double-tap, but the points did not.
    const { data: flipped, error } = await supabase
      .from('impostor_rounds')
      .update({ phase: 'reveal', finished_at: new Date().toISOString() })
      .eq('room_id', room.id)
      .eq('round_index', round.round_index)
      .eq('phase', 'voting')
      .select('round_index');
    if (error) throw error;
    if (!flipped?.length) {
      return NextResponse.json({ ok: true });
    }

    const { data: votes, error: votesError } = await supabase
      .from('impostor_votes')
      .select('voter_player_id, voted_player_id')
      .eq('room_id', room.id)
      .eq('round_index', round.round_index);
    if (votesError) throw votesError;

    // Same verdict the /reveal route shows the players — one definition, so the
    // payout and the screen can never disagree.
    const { evadedImpostorIds, correctVoterIds } = resolveRound({
      votes: votes ?? [],
      impostorIds: secret.impostor_player_ids,
    });

    await Promise.all([
      ...correctVoterIds.map((playerId) =>
        supabase.rpc('award_points', { p_player_id: playerId, p_points: CAUGHT_VOTER_POINTS })
      ),
      ...evadedImpostorIds.map((playerId) =>
        supabase.rpc('award_points', { p_player_id: playerId, p_points: IMPOSTOR_EVADED_POINTS })
      ),
    ]);

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
    if (!players || players.length < IMPOSTOR_MIN_PLAYERS) {
      // Checked every round, not just at start: players drop off mid-game, and
      // a round with fewer than three people has no deduction left in it.
      return NextResponse.json(
        { error: `Impostor needs at least ${IMPOSTOR_MIN_PLAYERS} players to continue` },
        { status: 409 }
      );
    }

    // Re-drawn every round from the current roster, so the count follows the
    // room if people leave, and nobody is stuck being the impostor twice by
    // construction.
    const impostorIds = pickImpostorIds(players.map((p) => p.id));
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
      impostor_player_ids: impostorIds,
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
