import { createServiceRoleClient } from '@/core/supabase/server';
import { pickRandomSubset } from '@/core/random/pickRandomSubset';
import type { Database } from '@/core/supabase/types';
import type { GameModeServerDefinition } from '@/core/gameModes/types';
import { IMPOSTOR_MIN_PLAYERS, pickImpostorIds } from './rules';

type Room = Database['public']['Tables']['rooms']['Row'];

// A level's word bank holds 50+ words for variety across many games; one
// room only ever plays this many rounds, randomly sampled at onStart.
const SESSION_LENGTH = 6;

async function onStart(room: Room) {
  const supabase = createServiceRoleClient();

  // The roster is re-read here rather than trusted from /start's own count:
  // minPlayers is enforced there, this is the fallback if it ever isn't.
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id')
    .eq('room_id', room.id);
  if (playersError) throw playersError;
  if (!players || players.length < IMPOSTOR_MIN_PLAYERS) {
    throw new Error(`Impostor needs at least ${IMPOSTOR_MIN_PLAYERS} players`);
  }

  const { data: track, error: trackError } = await supabase
    .from('impostor_tracks')
    .select('id')
    .eq('level', room.level)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (trackError) throw trackError;
  if (!track) throw new Error(`No active impostor track for level ${room.level}`);

  const { data: allWords, error: wordsError } = await supabase
    .from('impostor_words')
    .select('id, discussion_seconds')
    .eq('track_id', track.id);
  if (wordsError) throw wordsError;
  if (!allWords || allWords.length === 0) throw new Error(`Track ${track.id} has no words`);

  const sequence = pickRandomSubset(allWords, SESSION_LENGTH);
  const wordSequence = sequence.map((w) => w.id);

  const { error: sessionError } = await supabase.from('impostor_sessions').insert({
    room_id: room.id,
    track_id: track.id,
    word_sequence: wordSequence,
  });
  if (sessionError) throw sessionError;

  const impostorIds = pickImpostorIds(players.map((p) => p.id));
  const deadline = new Date(Date.now() + sequence[0].discussion_seconds * 1000).toISOString();

  const { error: roundError } = await supabase.from('impostor_rounds').insert({
    room_id: room.id,
    round_index: 0,
    phase: 'discussion',
    phase_deadline: deadline,
  });
  if (roundError) throw roundError;

  const { error: secretError } = await supabase.from('impostor_round_secrets').insert({
    room_id: room.id,
    round_index: 0,
    track_id: track.id,
    word_id: wordSequence[0],
    impostor_player_ids: impostorIds,
  });
  if (secretError) throw secretError;
}

export const impostorMode: GameModeServerDefinition = {
  id: 'impostor',
  minPlayers: IMPOSTOR_MIN_PLAYERS,
  onStart,
};
