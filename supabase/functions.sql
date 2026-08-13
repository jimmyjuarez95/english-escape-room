-- English Escape Room — Postgres functions
-- Run after schema.sql, in the Supabase SQL Editor.
--
-- These are called only from Next.js Route Handlers using the service role key,
-- which already bypasses RLS and has already verified the caller's
-- player_tokens.client_token. They are SECURITY DEFINER with a pinned
-- search_path, and the explicit revoke/grant blocks below are what actually
-- keeps them service-role-only.
--
-- Those grants are NOT optional. Postgres grants EXECUTE to PUBLIC by default
-- and Supabase additionally grants anon/authenticated, while PostgREST exposes
-- every public-schema function at /rest/v1/rpc/<name>. A SECURITY DEFINER
-- function left at the defaults is a hole straight through RLS for anyone
-- holding the anon key that ships in the browser bundle — which is exactly what
-- submit_answer was until migration 004.

create or replace function normalize_answer_text(p_text text) returns text
language sql immutable as $$
  select trim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9 ]', '', 'g'));
$$;

-- Atomic score increment. Read-then-write score updates lose points whenever two
-- players are scored concurrently — routine in trivia, where a whole room
-- answers the same question at once.
create or replace function award_points(p_player_id uuid, p_points int)
returns void
language sql
security definer
set search_path = public
as $$
  update players set score = score + p_points where id = p_player_id;
$$;

create or replace function submit_answer(
  p_room_id uuid,
  p_player_id uuid,
  p_team text,
  p_challenge_id uuid,
  p_answer jsonb,
  -- Accepted and IGNORED since 004. Elapsed time used to be taken from here,
  -- where a negative value minted arbitrary points. The parameter survives only
  -- because `create or replace` cannot drop it without leaving a second
  -- overload that PostgREST resolves as HTTP 300.
  p_time_taken_ms int default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer_key jsonb;
  v_grammar_point text;
  v_time_limit_seconds int;
  v_deadline timestamptz;
  v_is_current boolean := false;
  v_elapsed_ms int;
  v_is_correct boolean := false;
  v_submitted_index int;
  v_submitted_text text;
  v_advanced boolean := false;
  v_points int := 0;
begin
  select answer_key, grammar_point, time_limit_seconds
    into v_answer_key, v_grammar_point, v_time_limit_seconds
    from escape_room_challenges
   where id = p_challenge_id;

  if v_answer_key is null then
    raise exception 'Unknown challenge %', p_challenge_id;
  end if;

  -- challenge_deadline was set as (advance time + time_limit), so
  -- (deadline - time_limit) is when this challenge actually started. Read BEFORE
  -- the advance UPDATE below, which overwrites challenge_deadline.
  --
  -- Used for SCORING ONLY, never as a cutoff. Nothing auto-advances an expired
  -- challenge — this function is the only thing that moves current_index — so
  -- rejecting late answers would make an expired challenge permanently
  -- unanswerable, leaving finished_at null and the room stuck out of 'finished'
  -- with no results screen ever appearing.
  select ers.challenge_deadline, (ers.current_challenge_id = p_challenge_id)
    into v_deadline, v_is_current
    from escape_room_sessions ers
   where ers.room_id = p_room_id and ers.team = p_team;

  if v_is_current and v_deadline is not null then
    -- Clamped in SECONDS before scaling to ms: (epoch * 1000)::int overflows int
    -- for a deadline more than ~24 days stale, i.e. before least() could rescue it.
    v_elapsed_ms := (least(
        v_time_limit_seconds::numeric,
        greatest(0::numeric, extract(epoch from
          (now() - (v_deadline - make_interval(secs => v_time_limit_seconds)))))
      ) * 1000)::int;
  else
    -- Stale challenge id, or no deadline yet: score as the slowest valid answer
    -- rather than guessing in the player's favour.
    v_elapsed_ms := v_time_limit_seconds * 1000;
  end if;

  -- Branch on the answer_key shape, not challenge_type: several types share the
  -- same grading rule and this keeps them from drifting apart.
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

  -- attempts_escape_room_correct_unique_idx makes a repeat CORRECT answer to the
  -- same challenge conflict here, which is what stops replay farming: points are
  -- awarded below only when this insert actually landed.
  begin
    insert into attempts
      (room_id, player_id, game_mode, escape_room_challenge_id, is_correct,
       answer_payload, grammar_point, time_taken_ms)
    values
      (p_room_id, p_player_id, 'escape_room', p_challenge_id, v_is_correct,
       p_answer, v_grammar_point, v_elapsed_ms);
  exception when unique_violation then
    return jsonb_build_object('correct', true, 'advanced', false, 'duplicate', true);
  end;

  if v_is_correct then
    -- Compare-and-swap on current_challenge_id: concurrent solvers serialize on
    -- the row lock and the loser updates 0 rows, so the session advances once.
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

    -- Every correct answerer scores, not just whoever advanced the room.
    -- Inlined rather than calling award_points() to keep this function free of a
    -- cross-function EXECUTE dependency.
    v_points := 100 + greatest(0, 50 - v_elapsed_ms / 1000);
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

-- ============================================================
-- Lock the functions to the service role. See the header note: without this,
-- anon can call them straight through PostgREST and SECURITY DEFINER means they
-- run with RLS bypassed.
-- ============================================================
revoke execute on function public.normalize_answer_text(text)
  from public, anon, authenticated;
grant execute on function public.normalize_answer_text(text) to service_role;

revoke execute on function public.award_points(uuid, int)
  from public, anon, authenticated;
grant execute on function public.award_points(uuid, int) to service_role;

revoke execute on function public.submit_answer(uuid, uuid, text, uuid, jsonb, int)
  from public, anon, authenticated;
grant execute on function public.submit_answer(uuid, uuid, text, uuid, jsonb, int)
  to service_role;
