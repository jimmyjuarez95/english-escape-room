-- Multiple impostors — CONTRACT phase.
--
-- Run this ONLY after 004 has been applied AND the matching code is confirmed
-- live. Running it earlier makes every impostor round started during the Vercel
-- build window fail its insert, because the old code still writes
-- impostor_player_id.
--
-- Verify the deploy window left nothing behind first — this must return 0:
--   select count(*) from impostor_round_secrets where cardinality(impostor_player_ids) = 0;
-- If it returns rows, they are rounds written by the old code. They are dead
-- either way (their room has long since moved on), so deleting them is fine:
--   delete from impostor_round_secrets where cardinality(impostor_player_ids) = 0;

alter table impostor_round_secrets drop column impostor_player_id;

alter table impostor_round_secrets alter column impostor_player_ids drop default;

-- `uuid[] not null` does NOT mean "at least one impostor" — '{}' satisfies it,
-- and the old scalar column gave exactly-one for free. cardinality() rather than
-- array_length(x, 1), which returns NULL for '{}' and would let the check pass.
alter table impostor_round_secrets
  add constraint impostor_round_secrets_has_impostor
  check (cardinality(impostor_player_ids) > 0);
