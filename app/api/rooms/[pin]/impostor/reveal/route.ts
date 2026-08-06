import { NextResponse } from 'next/server';
import { getActiveRoomByPin } from '@/core/rooms/roomService';
import { createServiceRoleClient } from '@/core/supabase/server';

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
    .select('word_id, impostor_player_id')
    .eq('room_id', room.id)
    .eq('round_index', round.round_index)
    .maybeSingle();
  if (secretError) throw secretError;
  if (!secret) {
    return NextResponse.json({ reveal: null });
  }

  const [{ data: word, error: wordError }, { data: impostorPlayer, error: impostorError }, { data: votes, error: votesError }] =
    await Promise.all([
      supabase.from('impostor_words').select('word, category').eq('id', secret.word_id).single(),
      supabase.from('players').select('id, name').eq('id', secret.impostor_player_id).single(),
      supabase
        .from('impostor_votes')
        .select('voted_player_id')
        .eq('room_id', room.id)
        .eq('round_index', round.round_index),
    ]);
  if (wordError) throw wordError;
  if (impostorError) throw impostorError;
  if (votesError) throw votesError;

  const tallyByPlayer = new Map<string, number>();
  for (const vote of votes ?? []) {
    tallyByPlayer.set(vote.voted_player_id, (tallyByPlayer.get(vote.voted_player_id) ?? 0) + 1);
  }
  const votedPlayerIds = [...tallyByPlayer.keys()];
  const { data: votedPlayers } = votedPlayerIds.length
    ? await supabase.from('players').select('id, name').in('id', votedPlayerIds)
    : { data: [] };
  const nameById = new Map((votedPlayers ?? []).map((p) => [p.id, p.name]));

  const tally = [...tallyByPlayer.entries()]
    .map(([playerId, count]) => ({ playerId, name: nameById.get(playerId) ?? '?', count }))
    .sort((a, b) => b.count - a.count);

  const topCount = tally[0]?.count ?? 0;
  const topPlayers = tally.filter((t) => t.count === topCount);
  const caught = topPlayers.length === 1 && topPlayers[0].playerId === secret.impostor_player_id;

  return NextResponse.json({
    reveal: {
      roundIndex: round.round_index,
      word: word.word,
      category: word.category,
      impostor: { id: impostorPlayer.id, name: impostorPlayer.name },
      tally,
      caught,
    },
  });
}
