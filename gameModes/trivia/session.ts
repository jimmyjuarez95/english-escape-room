import { createServiceRoleClient } from '@/core/supabase/server';
import { pickRandomSubset } from '@/core/random/pickRandomSubset';
import type { Database } from '@/core/supabase/types';
import type { GameModeServerDefinition } from '@/core/gameModes/types';

type Room = Database['public']['Tables']['rooms']['Row'];

// A level's content bank holds 50+ questions for variety across many games;
// one room only ever plays this many, randomly sampled at onStart.
const SESSION_LENGTH = 10;

async function onStart(room: Room) {
  const supabase = createServiceRoleClient();

  const { data: track, error: trackError } = await supabase
    .from('trivia_tracks')
    .select('id')
    .eq('level', room.level)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (trackError) throw trackError;
  if (!track) throw new Error(`No active trivia track for level ${room.level}`);

  const { data: allQuestions, error: questionsError } = await supabase
    .from('trivia_questions')
    .select('id, time_limit_seconds')
    .eq('track_id', track.id);
  if (questionsError) throw questionsError;
  if (!allQuestions || allQuestions.length === 0) throw new Error(`Track ${track.id} has no questions`);

  const sequence = pickRandomSubset(allQuestions, SESSION_LENGTH);
  const questionSequence = sequence.map((q) => q.id);
  const deadline = new Date(Date.now() + sequence[0].time_limit_seconds * 1000).toISOString();

  // One row per room, unlike escape-room's per-team sessions: every player
  // answers the same shared question sequence regardless of team.
  const { error: sessionError } = await supabase.from('trivia_sessions').insert({
    room_id: room.id,
    track_id: track.id,
    current_index: 0,
    current_question_id: questionSequence[0],
    question_sequence: questionSequence,
    question_deadline: deadline,
  });
  if (sessionError) throw sessionError;
}

export const triviaMode: GameModeServerDefinition = {
  id: 'trivia',
  onStart,
};
