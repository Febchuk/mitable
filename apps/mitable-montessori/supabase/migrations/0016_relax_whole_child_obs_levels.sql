-- Relax the whole_child_obs_levels_both_or_neither check constraint to
-- additionally allow `from_level IS NULL AND to_level IS NOT NULL` — the
-- "initial assessment" shape, used when a teacher's first whole-child note
-- on an axis sets a level for the first time (no prior assessment to
-- transition from).
--
-- The other illegal shape (`from_level IS NOT NULL AND to_level IS NULL`)
-- remains forbidden — it would mean "the prior assessment is no longer
-- valid" without recording what we now believe, which has no UX.

alter table public.whole_child_observations
  drop constraint if exists whole_child_obs_levels_both_or_neither;

alter table public.whole_child_observations
  add constraint whole_child_obs_levels_legal
  check (
    (from_level is null and to_level is null)                     -- confirming
    or (from_level is null and to_level is not null)              -- initial assessment
    or (from_level is not null and to_level is not null)          -- transition
  );
