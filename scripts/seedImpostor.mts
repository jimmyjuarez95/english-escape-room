// Loads gameModes/impostor/content/seed/*.json into Supabase.
// Usage: node --env-file=.env.local scripts/seedImpostor.mts [file ...]
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
    'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with `node --env-file=.env.local scripts/seedImpostor.mts`'
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const seedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../gameModes/impostor/content/seed');

interface SeedWord {
  word: string;
  category: string;
  discussionSeconds: number;
  votingSeconds: number;
}

interface SeedTrack {
  level: string;
  title: string;
  words: SeedWord[];
}

async function seedTrack(fileName: string) {
  const raw = readFileSync(path.join(seedDir, fileName), 'utf-8');
  const track: SeedTrack = JSON.parse(raw);

  await supabase
    .from('impostor_tracks')
    .update({ is_active: false })
    .eq('level', track.level)
    .eq('is_active', true);

  const { data: trackRow, error: trackError } = await supabase
    .from('impostor_tracks')
    .insert({ level: track.level, title: track.title })
    .select()
    .single();
  if (trackError) throw trackError;

  const rows = track.words.map((word, index) => ({
    track_id: trackRow.id,
    order_index: index,
    word: word.word,
    category: word.category,
    discussion_seconds: word.discussionSeconds,
    voting_seconds: word.votingSeconds,
  }));

  const { error: wordsError } = await supabase.from('impostor_words').insert(rows);
  if (wordsError) throw wordsError;

  console.log(`Seeded ${track.level}: ${track.title} (${rows.length} words)`);
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
