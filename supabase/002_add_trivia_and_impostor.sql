-- Adds the Trivia and Impostor game modes on top of the schema created by
-- schema.sql (escape_room). Run this once in the Supabase SQL Editor against
-- a project that already has schema.sql applied — it is purely additive
-- (new tables + one new column + policies + realtime), so it's safe to run
-- alongside existing escape_room rooms/data.
--
-- This file's statements are duplicated inline in schema.sql (which now
-- documents the full desired end state for a fresh project) — this one is
-- just the runnable delta for a project that already ran the original
-- schema.sql before trivia/impostor existed.

insert into game_modes (id, label) values ('trivia', 'Trivia');
insert into game_modes (id, label) values ('impostor', 'Impostor');

-- ============================================================
-- Trivia mode-specific
-- ============================================================
create table trivia_tracks (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('A1','A2','B1','B2','C1','C2')),
  title text not null,
  is_active boolean not null default true
);

-- No anon policy at all: correct_index must never reach a browser directly.
-- /api/rooms/[pin]/trivia/state is the only read path, and it only includes
-- correct_index/explanation once the room's phase is 'reveal'.
create table trivia_questions (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references trivia_tracks(id) on delete cascade,
  order_index int not null,
  question text not null,
  options jsonb not null,           -- string[]
  correct_index int not null,       -- secret
  explanation text not null,
  grammar_point text,               -- tag used for the end-of-game "common mistakes" summary
  time_limit_seconds int not null default 20,
  unique (track_id, order_index)
);

-- One row per room (unlike escape_room_sessions, trivia has no per-team
-- track — every player answers the same shared question sequence).
create table trivia_sessions (
  room_id uuid primary key references rooms(id) on delete cascade,
  track_id uuid not null references trivia_tracks(id),
  current_index int not null default 0,
  current_question_id uuid references trivia_questions(id),
  phase text not null default 'question' check (phase in ('question','reveal')),
  question_deadline timestamptz,
  finished_at timestamptz
);

-- ============================================================
-- Impostor mode-specific
-- Whole-room social deduction: everyone but the impostor gets a secret word;
-- the impostor only sees the category. No per-team split — this mode is
-- collaborative-only, a single physical group.
-- ============================================================
create table impostor_tracks (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('A1','A2','B1','B2','C1','C2')),
  title text not null,
  is_active boolean not null default true
);

-- No anon policy at all: the word is secret from the impostor, and a plain
-- anon-readable table would leak it to every player's browser regardless of
-- what the UI shows. /api/rooms/[pin]/impostor/me is the only read path.
create table impostor_words (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references impostor_tracks(id) on delete cascade,
  order_index int not null,
  word text not null,              -- secret
  category text not null,          -- safe: shown to everyone, incl. the impostor
  discussion_seconds int not null default 90,
  voting_seconds int not null default 30,
  unique (track_id, order_index)
);

-- PUBLIC progress only: phase/timing/round index, never the word or who the
-- impostor is. Safe for anon + realtime, same reasoning as escape_room_sessions.
create table impostor_rounds (
  room_id uuid not null references rooms(id) on delete cascade,
  round_index int not null,
  phase text not null default 'discussion' check (phase in ('discussion','voting','reveal')),
  phase_deadline timestamptz,
  finished_at timestamptz,
  primary key (room_id, round_index)
);

-- SECRET: no anon policy, excluded from realtime — impostor_player_id is
-- exactly the kind of secret schema.sql's header warns never to expose.
create table impostor_round_secrets (
  room_id uuid not null,
  round_index int not null,
  track_id uuid not null references impostor_tracks(id),
  word_id uuid not null references impostor_words(id),
  impostor_player_id uuid not null references players(id),
  primary key (room_id, round_index),
  foreign key (room_id, round_index) references impostor_rounds(room_id, round_index) on delete cascade
);

-- SECRET until the reveal step tallies it server-side — same precedent as
-- escape_room_challenges.answer_key / attempts staying anon-unreadable.
create table impostor_votes (
  room_id uuid not null,
  round_index int not null,
  voter_player_id uuid not null references players(id) on delete cascade,
  voted_player_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, round_index, voter_player_id),
  foreign key (room_id, round_index) references impostor_rounds(room_id, round_index) on delete cascade
);

-- ============================================================
-- attempts: new nullable FK column for trivia (escape_room_challenge_id
-- already exists from schema.sql; this is the "future modes add their own
-- column" case it anticipated)
-- ============================================================
alter table attempts add column trivia_question_id uuid references trivia_questions(id);
-- Blocks double-submit atomically: a second answer to the same question by
-- the same player conflicts here rather than needing an app-level lock.
create unique index attempts_trivia_unique_idx on attempts(player_id, trivia_question_id)
  where trivia_question_id is not null;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table trivia_tracks enable row level security;
alter table trivia_questions enable row level security;
alter table trivia_sessions enable row level security;
alter table impostor_tracks enable row level security;
alter table impostor_words enable row level security;
alter table impostor_rounds enable row level security;
alter table impostor_round_secrets enable row level security;
alter table impostor_votes enable row level security;

-- Public read: safe for any player in any room to see.
create policy "public read trivia_sessions" on trivia_sessions for select using (true);
create policy "public read impostor_rounds" on impostor_rounds for select using (true);

-- Everything else added here (trivia_tracks, trivia_questions,
-- impostor_tracks, impostor_words, impostor_round_secrets, impostor_votes)
-- gets no policy at all: default-deny for anon, readable only by the
-- service role from Next.js Route Handlers.

-- ============================================================
-- Realtime
-- ============================================================
alter publication supabase_realtime add table trivia_sessions;
alter publication supabase_realtime add table impostor_rounds;
