// Loads gameModes/escape-room/content/seed/*.json into Supabase.
// Usage: node --env-file=.env.local scripts/seed.mts [file ...]
// Defaults to a1.json when no files are given. Re-running for a level
// deactivates that level's previous track instead of deleting it, so old
// rooms that already started keep working against the track they began on.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with `node --env-file=.env.local scripts/seed.ts`'
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const seedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../gameModes/escape-room/content/seed');

interface SeedChallenge {
  type: string;
  prompt: Record<string, unknown>;
  correctAnswers?: string[];
  correctIndex?: number;
  explanation: string;
  grammarPoint: string;
  pieceReward: string;
  timeLimitSeconds: number;
}

interface SeedTrack {
  level: string;
  title: string;
  finalCode: string;
  challenges: SeedChallenge[];
}

async function seedTrack(fileName: string) {
  const raw = readFileSync(path.join(seedDir, fileName), 'utf-8');
  const track: SeedTrack = JSON.parse(raw);

  await supabase
    .from('escape_room_tracks')
    .update({ is_active: false })
    .eq('level', track.level)
    .eq('is_active', true);

  const { data: trackRow, error: trackError } = await supabase
    .from('escape_room_tracks')
    .insert({ level: track.level, title: track.title, final_code: track.finalCode })
    .select()
    .single();
  if (trackError) throw trackError;

  const rows = track.challenges.map((challenge, index) => ({
    track_id: trackRow.id,
    order_index: index,
    challenge_type: challenge.type,
    prompt_display: challenge.prompt,
    answer_key:
      challenge.correctIndex !== undefined
        ? { correctIndex: challenge.correctIndex }
        : { correctAnswers: challenge.correctAnswers },
    explanation: challenge.explanation,
    grammar_point: challenge.grammarPoint,
    piece_reward: challenge.pieceReward,
    time_limit_seconds: challenge.timeLimitSeconds,
  }));

  const { error: challengesError } = await supabase.from('escape_room_challenges').insert(rows);
  if (challengesError) throw challengesError;

  console.log(`Seeded ${track.level}: ${track.title} (${rows.length} challenges)`);
}

async function main() {
  const files = process.argv.slice(2);
  const targets = files.length > 0 ? files : ['a1.json'];
  for (const file of targets) {
    await seedTrack(file);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
