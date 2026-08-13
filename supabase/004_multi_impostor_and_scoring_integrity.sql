-- Multiple impostors + scoring integrity.
--
-- Run this once in the Supabase SQL Editor BEFORE deploying the matching code.
-- Everything here is backwards-compatible with the code currently live: the
-- revokes don't touch the service role, award_points is not called yet, the new
-- attempts index only blocks the exploit it exists to close, submit_answer keeps
-- its exact signature, and impostor_player_id survives (merely nullable) so a
-- round started during the deploy window still inserts.
--
-- The destructive half — dropping impostor_player_id and adding the "at least
-- one impostor" check — is deliberately deferred to 005, to be run only once the
-- new code is confirmed live. Do not merge the two files.
--
-- As with 002/003, these statements are duplicated inline in schema.sql /
-- functions.sql, which document the full desired end state for a fresh project.

-- ============================================================
-- 1. CRITICAL: submit_answer is SECURITY DEFINER and, by default, executable by
--    anon through PostgREST's /rest/v1/rpc/<name>. functions.sql's header
--    asserted it was "never exposed as a public RPC to the anon key", but
--    nothing enforced that: Postgres grants EXECUTE to PUBLIC by default and
--    Supabase additionally grants anon/authenticated. Since the function is
--    SECURITY DEFINER it runs as its owner and bypasses RLS, and every input it
--    needs is anon-readable (players via "public read players",
--    escape_room_challenges_public via its grant). Anyone holding the anon key
--    that ships in the browser bundle could award themselves points and advance
--    any room's session without ever touching the app.
-- ============================================================
revoke execute on function public.submit_answer(uuid, uuid, text, uuid, jsonb, int)
  from public, anon, authenticated;
grant execute on function public.submit_answer(uuid, uuid, text, uuid, jsonb, int)
  to service_role;

revoke execute on function public.normalize_answer_text(text)
  from public, anon, authenticated;
grant execute on function public.normalize_answer_text(text) to service_role;

-- ============================================================
-- 2. Atomic score increment, replacing the read-then-write pairs in
--    impostor/advance and trivia/answer. Those lose updates whenever two
--    players are scored concurrently — routine in trivia, where a whole room
--    answers the same question at once.
--    Locked down for the same reason as submit_answer: an anon-callable
--    award_points would be a one-line score rewrite.
-- ============================================================
create or replace function award_points(p_player_id uuid, p_points int)
returns void
language sql
security definer
set search_path = public
as $$
  update players set score = score + p_points where id = p_player_id;
$$;

revoke execute on function public.award_points(uuid, int)
  from public, anon, authenticated;
grant execute on function public.award_points(uuid, int) to service_role;

-- ============================================================
-- 3. Escape-room replay farming: submit_answer awarded points on every correct
--    submission, so replaying one winning POST N times paid out N times. The
--    trivia half of attempts already had this guard (attempts_trivia_unique_idx);
--    the escape-room half never did.
--
--    The predicate is narrower than trivia's on purpose: escape room allows
--    retrying after a WRONG answer, so only repeat CORRECT attempts may collide.
--    Two different players answering the same challenge never collide either.
--
--    A unique index cannot be built over existing duplicates. Verified zero on
--    this project before writing the migration; re-check before running it
--    anywhere else:
--      select player_id, escape_room_challenge_id, count(*) from attempts
--       where escape_room_challenge_id is not null and is_correct
--       group by 1,2 having count(*) > 1;
--    If that returns rows, keep only the earliest of each group (the "common
--    mistakes" report reads is_correct = false only, so deleting duplicate
--    correct attempts costs no reporting data):
--      delete from attempts where id in (
--        select id from (
--          select id, row_number() over (
--                   partition by player_id, escape_room_challenge_id
--                   order by created_at, id) as rn
--            from attempts
--           where escape_room_challenge_id is not null and is_correct
--        ) ranked where rn > 1);
-- ============================================================
create unique index attempts_escape_room_correct_unique_idx
  on attempts (player_id, escape_room_challenge_id)
  where escape_room_challenge_id is not null and is_correct;

-- ============================================================
-- 4. Multiple impostors — EXPAND phase only.
--    One impostor is spotted far too easily in a big group, so the count now
--    scales with the room (see gameModes/impostor/rules.ts). A uuid[] rather
--    than a child table because supabase-js sends each statement separately with
--    no transaction: a child table would leave rounds with zero impostors if the
--    second insert failed, whereas the array is written in the same insert as
--    the rest of the secret. Same precedent as word_sequence/challenge_sequence.
--
--    impostor_player_id keeps its data and is only made nullable: the currently
--    deployed code still writes it, and the incoming code cannot insert at all
--    while it is still NOT NULL. 005 drops it.
-- ============================================================
alter table impostor_round_secrets
  add column impostor_player_ids uuid[] not null default '{}';

update impostor_round_secrets
   set impostor_player_ids = array[impostor_player_id]
 where cardinality(impostor_player_ids) = 0
   and impostor_player_id is not null;

alter table impostor_round_secrets
  alter column impostor_player_id drop not null;

-- ============================================================
-- 5. submit_answer: stop trusting the client's stopwatch.
--    p_time_taken_ms was fed straight into the speed bonus, so a negative value
--    minted arbitrary points. Elapsed time is now DERIVED from the deadline the
--    server itself set. The parameter is kept and ignored rather than removed:
--    `create or replace` cannot rename or retype a parameter, and dropping it
--    would leave a second overload that PostgREST resolves as HTTP 300.
--
--    Note the deadline is used for SCORING ONLY, never as a cutoff. Nothing
--    auto-advances an expired challenge — submit_answer is the only thing that
--    moves current_index — so rejecting late answers would make an expired
--    challenge permanently unanswerable, leaving finished_at null and the room
--    stuck out of 'finished' forever, with no results screen.
-- ============================================================
create or replace function submit_answer(
  p_room_id uuid,
  p_player_id uuid,
  p_team text,
  p_challenge_id uuid,
  p_answer jsonb,
  p_time_taken_ms int default null   -- accepted for signature compatibility, IGNORED
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
