import { NextResponse } from 'next/server';
import { getActiveRoomByPin } from '@/core/rooms/roomService';
import { createServiceRoleClient } from '@/core/supabase/server';
import { resolveRound } from '@/gameModes/impostor/rules';

// Phase-gated read, same idea as trivia's /state reveal field: the word and
// who the impostor was become genuinely public the moment phase is 'reveal'
// (everyone's screen is meant to show it), so this needs no player auth —
// only the phase check guards it, mirroring why trivia_questions.correct_index
// stays hidden until that mode's own reveal phase.
export async function GET(request: Request, { params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;

  const room = await getActiveRoomByPin(pin);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
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
  if (!round || round.phase !== 'reveal') {
    return NextResponse.json({ reveal: null });
  }

  const { data: secret, error: secretError } = await supabase
    .from('impostor_round_secrets')
    .select('word_id, impostor_player_ids')
    .eq('room_id', room.id)
    .eq('round_index', round.round_index)
    .maybeSingle();
  if (secretError) throw secretError;
  if (!secret) {
    return NextResponse.json({ reveal: null });
  }

  const [{ data: word, error: wordError }, { data: votes, error: votesError }] = await Promise.all([
    supabase.from('impostor_words').select('word, category').eq('id', secret.word_id).single(),
    supabase
      .from('impostor_votes')
      .select('voter_player_id, voted_player_id')
      .eq('room_id', room.id)
      .eq('round_index', round.round_index),
  ]);
  if (wordError) throw wordError;
  if (votesError) throw votesError;

  const { tally: rawTally, caughtImpostorIds } = resolveRound({
    votes: votes ?? [],
    impostorIds: secret.impostor_player_ids,
  });

  // One lookup for both the impostors and everyone who received a vote. Names
  // come from a Map with a fallback rather than a per-id .single(), so a player
  // row that has gone missing degrades to '?' instead of failing the whole
  // reveal — the same treatment the voted players already got.
  const namedIds = [...new Set([...secret.impostor_player_ids, ...rawTally.map((t) => t.playerId)])];
  const { data: namedPlayers } = namedIds.length
    ? await supabase.from('players').select('id, name').in('id', namedIds)
    : { data: [] };
  const nameById = new Map((namedPlayers ?? []).map((p) => [p.id, p.name]));

  return NextResponse.json({
    reveal: {
      roundIndex: round.round_index,
      word: word.word,
      category: word.category,
      impostors: secret.impostor_player_ids.map((id) => ({
        id,
        name: nameById.get(id) ?? '?',
        caught: caughtImpostorIds.includes(id),
      })),
      tally: rawTally.map((t) => ({ ...t, name: nameById.get(t.playerId) ?? '?' })),
      caught: caughtImpostorIds.length > 0,
    },
  });
}
