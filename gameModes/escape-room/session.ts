import { createServiceRoleClient } from '@/core/supabase/server';
import { pickRandomSubset } from '@/core/random/pickRandomSubset';
import type { Database } from '@/core/supabase/types';
import type { GameModeServerDefinition } from '@/core/gameModes/types';

type Room = Database['public']['Tables']['rooms']['Row'];
type Team = Database['public']['Tables']['players']['Row']['team'];

// A level's content bank holds 50+ challenges for variety across many
// games; one room only ever plays this many, randomly sampled at onStart.
const SESSION_LENGTH = 8;

async function onStart(room: Room) {
  const supabase = createServiceRoleClient();

  const { data: track, error: trackError } = await supabase
    .from('escape_room_tracks')
    .select('id')
    .eq('level', room.level)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (trackError) throw trackError;
  if (!track) throw new Error(`No active escape-room track for level ${room.level}`);

  const { data: allChallenges, error: challengesError } = await supabase
    .from('escape_room_challenges')
    .select('id, time_limit_seconds')
    .eq('track_id', track.id);
  if (challengesError) throw challengesError;
  if (!allChallenges || allChallenges.length === 0) throw new Error(`Track ${track.id} has no challenges`);

  // Same sequence for both teams in teams mode — fair competition, still
  // varies from one room to the next.
  const sequence = pickRandomSubset(allChallenges, SESSION_LENGTH);
  const challengeSequence = sequence.map((c) => c.id);
  const deadline = new Date(Date.now() + sequence[0].time_limit_seconds * 1000).toISOString();

  const teams: Team[] = room.play_style === 'teams' ? ['A', 'B'] : [''];

  const { error: sessionError } = await supabase.from('escape_room_sessions').insert(
    teams.map((team) => ({
      room_id: room.id,
      team,
      track_id: track.id,
      current_index: 0,
      current_challenge_id: challengeSequence[0],
      challenge_sequence: challengeSequence,
      challenge_deadline: deadline,
    }))
  );
  if (sessionError) throw sessionError;
}

export const escapeRoomMode: GameModeServerDefinition = {
  id: 'escape_room',
  onStart,
};
