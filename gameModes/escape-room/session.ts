import { createServiceRoleClient } from '@/core/supabase/server';
import type { Database } from '@/core/supabase/types';
import type { GameModeServerDefinition } from '@/core/gameModes/types';

type Room = Database['public']['Tables']['rooms']['Row'];
type Team = Database['public']['Tables']['players']['Row']['team'];

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

  const { data: firstChallenge, error: challengeError } = await supabase
    .from('escape_room_challenges')
    .select('id, time_limit_seconds')
    .eq('track_id', track.id)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (challengeError) throw challengeError;
  if (!firstChallenge) throw new Error(`Track ${track.id} has no challenges`);

  const teams: Team[] = room.play_style === 'teams' ? ['A', 'B'] : [''];
  const deadline = new Date(Date.now() + firstChallenge.time_limit_seconds * 1000).toISOString();

  const { error: sessionError } = await supabase.from('escape_room_sessions').insert(
    teams.map((team) => ({
      room_id: room.id,
      team,
      track_id: track.id,
      current_index: 0,
      current_challenge_id: firstChallenge.id,
      challenge_deadline: deadline,
    }))
  );
  if (sessionError) throw sessionError;
}

export const escapeRoomMode: GameModeServerDefinition = {
  id: 'escape_room',
  onStart,
};
