-- English Escape Room — Postgres functions
-- Run after schema.sql, in the Supabase SQL Editor.
--
-- submit_answer is only ever called from a Next.js Route Handler using the
-- service role key (which already bypasses RLS and has already verified the
-- caller's player_tokens.client_token) — never exposed as a public RPC to the
-- anon key. It is SECURITY DEFINER with a pinned search_path as defense in
-- depth, not because it needs to be.

create or replace function normalize_answer_text(p_text text) returns text
language sql immutable as $$
  select trim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9 ]', '', 'g'));
$$;

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

  -- Branch on the answer_key's shape, not the challenge_type: any challenge
  -- type that stores {correctIndex} or {correctAnswers} is handled without
  -- modifying this function — a future challenge type only needs a new
  -- branch here if it introduces a genuinely new answer shape.
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
    -- Compare-and-swap: this UPDATE only affects a row if it's still pointed
    -- at p_challenge_id. Two players answering the same challenge within the
    -- same instant both attempt this UPDATE; Postgres row-locking serializes
    -- them, and only the first to commit still finds a match — the second
    -- updates 0 rows. No advisory locks or mutex table needed.
    update escape_room_sessions ers
       set current_index = ers.current_index + 1,
           current_challenge_id = (
             select c.id from escape_room_challenges c
              where c.track_id = ers.track_id
                and c.order_index = ers.current_index + 1
           ),
           -- Deadline for whichever challenge the room just moved to — null
           -- (no countdown shown) once the track is finished.
           challenge_deadline = (
             select now() + make_interval(secs => c.time_limit_seconds)
               from escape_room_challenges c
              where c.track_id = ers.track_id
                and c.order_index = ers.current_index + 1
           ),
           finished_at = case
             when not exists (
               select 1 from escape_room_challenges c
                where c.track_id = ers.track_id
                  and c.order_index = ers.current_index + 1
             ) then now()
             else ers.finished_at
           end
     where ers.room_id = p_room_id
       and ers.team = p_team
       and ers.current_challenge_id = p_challenge_id
    returning true into v_advanced;

    -- Points go to every player who answered correctly, not only whoever won
    -- the race to advance the room — a correct-but-slightly-slower answer
    -- still counts, it just doesn't unlock the next clue.
    v_points := 100 + greatest(0, 50 - coalesce(p_time_taken_ms, 60000) / 1000);
    update players set score = score + v_points where id = p_player_id;

    -- Once every session (both teams, or the single collaborative one) has
    -- finished, the room itself is done — this is what flips host/players
    -- over to the results screen.
    if coalesce(v_advanced, false) and not exists (
      select 1 from escape_room_sessions where room_id = p_room_id and finished_at is null
    ) then
      update rooms set status = 'finished', finished_at = now() where id = p_room_id;
    end if;
  end if;

  return jsonb_build_object('correct', v_is_correct, 'advanced', coalesce(v_advanced, false));
end;
$$;
