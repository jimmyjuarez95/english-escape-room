-- English Escape Room — core schema
-- Run this once in the Supabase SQL Editor (Phase 0 setup).
--
-- Security model: no user auth. All writes go through Next.js Route Handlers
-- using the service role key (bypasses RLS). The anon key (browser) only ever
-- gets SELECT, and only on rows/columns that are safe for any player in a room
-- to read. Anything that must stay secret (answer keys, the final escape code,
-- host/player auth tokens) lives in a table with NO anon policy at all, and is
-- deliberately excluded from the supabase_realtime publication, since a
-- Postgres Changes payload includes every column of the changed row — putting
-- a secret in a realtime-published, anon-readable table leaks it to every
-- client in the room the moment that row changes, regardless of column-level
-- SELECT grants.

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ============================================================
-- Catalog: registering a future game mode never touches rooms/players
-- ============================================================
create table game_modes (
  id text primary key,          -- 'escape_room' | future: 'trivia' | 'impostor'
  label text not null,
  is_active boolean not null default true
);
insert into game_modes (id, label) values ('escape_room', 'Escape Room');
insert into game_modes (id, label) values ('trivia', 'Trivia');
insert into game_modes (id, label) values ('impostor', 'Impostor');

-- ============================================================
-- Core: shared by every game mode, forever
-- ============================================================
create table rooms (
  id uuid primary key default gen_random_uuid(),
  pin text not null,
  game_mode text not null references game_modes(id),
  level text not null check (level in ('A1','A2','B1','B2','C1','C2')),
  play_style text not null default 'collaborative' check (play_style in ('collaborative','teams')),
  status text not null default 'lobby' check (status in ('lobby','in_progress','finished')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
-- PINs are recycled once a room finishes, without ever running out of codes.
create unique index rooms_active_pin_idx on rooms (pin) where status <> 'finished';

-- Host auth secret, deliberately NOT a column on rooms (see header note).
-- Returned once to the creating browser in the create-room API response and
-- stored in localStorage; every host-only action must present it, checked
-- server-side (service role) against this table.
create table room_hosts (
  room_id uuid primary key references rooms(id) on delete cascade,
  host_secret uuid not null default gen_random_uuid()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,
  team text not null default '' check (team in ('','A','B')),  -- '' = no team (collaborative mode)
  score int not null default 0,
  joined_at timestamptz not null default now()
);
create index players_room_idx on players(room_id);
create unique index players_room_name_idx on players (room_id, lower(name));

-- Player rejoin secret, kept out of players (same reasoning as room_hosts):
-- players is anon-readable and realtime-published so every phone in the room
-- can render the live roster/scoreboard, but nothing there should let one
-- player impersonate another when submitting an answer.
create table player_tokens (
  player_id uuid primary key references players(id) on delete cascade,
  client_token uuid not null default gen_random_uuid()
);

-- ============================================================
-- Escape-room mode-specific (would NOT be touched adding trivia/impostor)
-- ============================================================
create table escape_room_tracks (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('A1','A2','B1','B2','C1','C2')),
  title text not null,
  final_code text not null,      -- secret: never exposed to anon, see header note
  is_active boolean not null default true
);

create table escape_room_challenges (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references escape_room_tracks(id) on delete cascade,
  order_index int not null,
  challenge_type text not null check (challenge_type in
    ('fill_blank','sentence_correction','vocab_trivia','listening','speaking')),
  prompt_display jsonb not null,  -- only what's safe to send to the client (question, options, audio text)
  answer_key jsonb not null,      -- correct answer(s)/index — secret, never exposed to anon
  explanation text not null,      -- shown after the player answers, either way
  grammar_point text,             -- tag used for the end-of-game "common mistakes" summary
  piece_reward text not null,     -- fragment of the final code unlocked on success
  time_limit_seconds int not null default 60,
  unique (track_id, order_index)
);

-- Safe subset of escape_room_challenges for the browser: no answer_key.
-- Views run with their owner's privileges by default (not the querying
-- role's), so granting anon SELECT here does not require — or grant — anon
-- SELECT on the underlying table.
create view escape_room_challenges_public as
  select id, track_id, order_index, challenge_type, prompt_display, time_limit_seconds
  from escape_room_challenges;

create table escape_room_sessions (
  room_id uuid not null references rooms(id) on delete cascade,
  team text not null default '',  -- '' = collaborative track, 'A'/'B' = per-team track
  track_id uuid not null references escape_room_tracks(id),
  current_index int not null default 0,
  current_challenge_id uuid references escape_room_challenges(id),
  -- The short (e.g. 8-challenge) subset randomly sampled from the track's
  -- full content bank at onStart, in play order — see
  -- gameModes/escape-room/session.ts and submit_answer's advance step in
  -- functions.sql. Lets a level hold 50+ challenges for variety across
  -- games without any single game running through all of them.
  challenge_sequence uuid[] not null default '{}',
  -- Deadline for the *current* challenge, not the room: in teams mode each
  -- team advances independently, so the timer has to live per (room, team),
  -- not as a single room-wide field.
  challenge_deadline timestamptz,
  finished_at timestamptz,
  primary key (room_id, team)
);

-- ============================================================
-- Trivia mode-specific (would NOT be touched adding escape-room/impostor)
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
  -- The short (e.g. 10-question) subset randomly sampled from the track's
  -- full question bank at onStart, in play order — see
  -- gameModes/trivia/session.ts and the /trivia/advance route. Lets a level
  -- hold 50+ questions for variety across games without any single game
  -- running through all of them.
  question_sequence uuid[] not null default '{}',
  phase text not null default 'question' check (phase in ('question','reveal')),
  question_deadline timestamptz,
  finished_at timestamptz
);

-- ============================================================
-- Impostor mode-specific (would NOT be touched adding escape-room/trivia)
-- Whole-room social deduction: everyone but the impostor gets a secret word;
-- the impostor only sees the category. No per-team split (see AGENTS.md/plan
-- notes — this mode is collaborative-only, a single physical group).
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

-- The short (e.g. 6-word) subset randomly sampled from the track's full word
-- bank at onStart, in play order — see gameModes/impostor/session.ts and the
-- /impostor/advance route. Lets a level hold 50+ words for variety across
-- games without any single game running through all of them. Never read by
-- a client (only onStart/advance use it), so no anon policy needed.
create table impostor_sessions (
  room_id uuid primary key references rooms(id) on delete cascade,
  track_id uuid not null references impostor_tracks(id),
  word_sequence uuid[] not null default '{}'
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
-- exactly the kind of secret this file's header warns never to expose.
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
-- Attempts log: every submission, right or wrong — feeds "common mistakes"
-- ============================================================
create table attempts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  game_mode text not null references game_modes(id),
  escape_room_challenge_id uuid references escape_room_challenges(id), -- future modes add their own nullable FK column
  trivia_question_id uuid references trivia_questions(id),
  is_correct boolean not null,
  answer_payload jsonb not null,
  grammar_point text,              -- denormalized copy, survives later content edits
  time_taken_ms int,
  created_at timestamptz not null default now()
);
create index attempts_room_idx on attempts(room_id);
create index attempts_mistakes_idx on attempts(room_id, is_correct, grammar_point);
-- Blocks double-submit atomically: a second answer to the same question by
-- the same player conflicts here rather than needing an app-level lock.
create unique index attempts_trivia_unique_idx on attempts(player_id, trivia_question_id)
  where trivia_question_id is not null;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table game_modes enable row level security;
alter table rooms enable row level security;
alter table room_hosts enable row level security;
alter table players enable row level security;
alter table player_tokens enable row level security;
alter table escape_room_tracks enable row level security;
alter table escape_room_challenges enable row level security;
alter table escape_room_sessions enable row level security;
alter table trivia_tracks enable row level security;
alter table trivia_questions enable row level security;
alter table trivia_sessions enable row level security;
alter table impostor_tracks enable row level security;
alter table impostor_words enable row level security;
alter table impostor_sessions enable row level security;
alter table impostor_rounds enable row level security;
alter table impostor_round_secrets enable row level security;
alter table impostor_votes enable row level security;
alter table attempts enable row level security;

-- Public read: safe for any player in any room to see.
create policy "public read game_modes" on game_modes for select using (true);
create policy "public read rooms" on rooms for select using (true);
create policy "public read players" on players for select using (true);
create policy "public read sessions" on escape_room_sessions for select using (true);
create policy "public read trivia_sessions" on trivia_sessions for select using (true);
create policy "public read impostor_rounds" on impostor_rounds for select using (true);
grant select on escape_room_challenges_public to anon, authenticated;

-- Everything else (room_hosts, player_tokens, escape_room_tracks,
-- escape_room_challenges base table, trivia_tracks, trivia_questions,
-- impostor_tracks, impostor_words, impostor_sessions, impostor_round_secrets,
-- impostor_votes, attempts) gets no policy at all, which means default-deny
-- for anon: readable only by the service role from Next.js Route Handlers,
-- or by SECURITY DEFINER functions.
--
-- No INSERT/UPDATE/DELETE policy exists anywhere for anon on any table —
-- every mutation must go through a server route using the service role key.

-- ============================================================
-- Realtime: only the tables player/host screens actually need to watch live.
-- room_hosts, player_tokens, escape_room_tracks/challenges and attempts are
-- intentionally excluded (see header note on why secrets must never sit in
-- a realtime-published table).
-- ============================================================
alter publication supabase_realtime add table rooms, players, escape_room_sessions;
alter publication supabase_realtime add table trivia_sessions;
alter publication supabase_realtime add table impostor_rounds;
