-- Changes every game mode from "one game = the entire content track,
-- start to finish" to "one game = a short, randomly-sampled subset of a
-- much bigger content bank" (e.g. 8 of 50 escape-room challenges, 10 of 50
-- trivia questions, 6 of 50 impostor words). This is what makes 50-item
-- content banks per CEFR level make sense — without it, a single Impostor
-- game would run all 50 rounds back to back (~2-3 hours).
--
-- Run this once in the Supabase SQL Editor, after schema.sql and
-- 002_add_trivia_and_impostor.sql. Purely additive (new columns default to
-- '{}', new table, one function replaced) — safe alongside existing data,
-- though any room already `in_progress` when you run this keeps whatever
-- session state it had before (its challenge_sequence/question_sequence
-- will be empty, so let those finish or discard them before starting new
-- games with the updated mode code).

alter table escape_room_sessions add column challenge_sequence uuid[] not null default '{}';
alter table trivia_sessions add column question_sequence uuid[] not null default '{}';

-- Never read by a client (only onStart/advance use it), so no anon policy —
-- same default-deny precedent as escape_room_challenges' base table.
create table impostor_sessions (
  room_id uuid primary key references rooms(id) on delete cascade,
  track_id uuid not null references impostor_tracks(id),
  word_sequence uuid[] not null default '{}'
);
alter table impostor_sessions enable row level security;

-- Full replacement of submit_answer: only the "advance" block changed, from
-- querying escape_room_challenges by order_index to indexing into
-- challenge_sequence (the room's randomly-sampled subset). Everything else
-- is identical to the version in functions.sql.
create or replace function submit_answer(
  p_room_id uuid,
  p_player_id uuid,
  p_team text,
  p_challenge_id uuid,
  p_answer jsonb,
  p_time_taken_ms int default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer_key jsonb;
  v_grammar_point text;
  v_is_correct boolean := false;
  v_submitted_index int;
  v_submitted_text text;
  v_advanced boolean := false;
  v_points int := 0;
begin
  select answer_key, grammar_point
    into v_answer_key, v_grammar_point
    from escape_room_challenges
   where id = p_challenge_id;

  if v_answer_key is null then
    raise exception 'Unknown challenge %', p_challenge_id;
  end if;

  if v_answer_key ? 'correctIndex' then
    v_submitted_index := (p_answer->>'index')::int;
    v_is_correct := v_submitted_index = (v_answer_key->>'correctIndex')::int;
  else
    v_submitted_text := normalize_answer_text(p_answer->>'text');
    select exists (
      select 1 from jsonb_array_elements_text(v_answer_key->'correctAnswers') as opt
      where normalize_answer_text(opt) = v_submitted_text
    ) into v_is_correct;
  end if;

  insert into attempts
    (room_id, player_id, game_mode, escape_room_challenge_id, is_correct, answer_payload, grammar_point, time_taken_ms)
  values
    (p_room_id, p_player_id, 'escape_room', p_challenge_id, v_is_correct, p_answer, v_grammar_point, p_time_taken_ms);

  if v_is_correct then
    -- challenge_sequence is the short, randomly-sampled subset of the
    -- (much larger) track chosen once at onStart — see
    -- gameModes/escape-room/session.ts — so "next challenge" is an array
    -- lookup, not a query by order_index. Postgres arrays are 1-indexed, so
    -- the item after current_index (0-based) sits at current_index + 2;
    -- indexing past the end returns NULL, which is exactly "track finished".
    update escape_room_sessions ers
       set current_index = ers.current_index + 1,
           current_challenge_id = ers.challenge_sequence[ers.current_index + 2],
           challenge_deadline = (
             select now() + make_interval(secs => c.time_limit_seconds)
               from escape_room_challenges c
              where c.id = ers.challenge_sequence[ers.current_index + 2]
           ),
           finished_at = case
             when ers.challenge_sequence[ers.current_index + 2] is null then now()
             else ers.finished_at
           end
     where ers.room_id = p_room_id
       and ers.team = p_team
       and ers.current_challenge_id = p_challenge_id
    returning true into v_advanced;

    v_points := 100 + greatest(0, 50 - coalesce(p_time_taken_ms, 60000) / 1000);
    update players set score = score + v_points where id = p_player_id;

    if coalesce(v_advanced, false) and not exists (
      select 1 from escape_room_sessions where room_id = p_room_id and finished_at is null
    ) then
      update rooms set status = 'finished', finished_at = now() where id = p_room_id;
    end if;
  end if;

  return jsonb_build_object('correct', v_is_correct, 'advanced', coalesce(v_advanced, false));
end;
$$;
