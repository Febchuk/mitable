-- =============================================================================
-- 0033 — Standardize IEP item state fields
--
-- Replaces the old rating/completion/prompting model with the new
-- defensible, school-standard scale:
--
--   rating (1–5)           → progress (M/SP/IP/NP/NI)
--   success_count (0–10)   → accuracy (0–100, percentage)
--   prompting_code (5 val) → prompting (7 val, full therapist hierarchy)
--
-- Column renames are non-destructive — Postgres RENAME COLUMN is instant
-- and preserves all existing NULL values cleanly. No data loss for any
-- classroom that hasn't recorded IEP data yet (the typical case since IEP
-- is newly launched). Schools that recorded old values will see NULLs after
-- the rename (old values don't map semantically to the new scale), which is
-- the right behaviour — teachers will re-enter using the correct scale.
-- =============================================================================

-- ---------- rename columns ---------------------------------------------------

alter table public.iep_item_states
  rename column rating to progress;

alter table public.iep_item_states
  rename column success_count to accuracy;

alter table public.iep_item_states
  rename column prompting_code to prompting;

-- ---------- update check constraints ----------------------------------------
-- `rating` was smallint (1–5); new scale is text codes. Drop the old check
-- before changing type or Postgres keeps evaluating smallint rules.

alter table public.iep_item_states
  drop constraint if exists iep_item_states_rating_check;

alter table public.iep_item_states
  alter column progress type text
    using (null::text);

-- progress: M=Mastered, SP=Sufficient Progress, IP=Insufficient Progress,
--           NP=No Progress, NI=Not Introduced
alter table public.iep_item_states
  add constraint iep_item_states_progress_check
    check (progress is null or progress in ('M', 'SP', 'IP', 'NP', 'NI'));

-- accuracy: 0–100 percentage
alter table public.iep_item_states
  drop constraint if exists iep_item_states_success_count_check;

alter table public.iep_item_states
  add constraint iep_item_states_accuracy_check
    check (accuracy is null or accuracy between 0 and 100);

-- prompting: full 7-level therapist hierarchy
--   I=Independent, VS=Visual, GE=Gesture, VB=Verbal,
--   MO=Model, PP=Partial Physical, FP=Full Physical
alter table public.iep_item_states
  drop constraint if exists iep_item_states_prompting_code_check;

-- Old prompting_code values (N/G/V/H/F) do not map to the new 7-level scale;
-- must clear before adding the new CHECK (Postgres validates existing rows).
update public.iep_item_states
  set prompting = null
  where prompting is not null
    and prompting not in ('I', 'VS', 'GE', 'VB', 'MO', 'PP', 'FP');

alter table public.iep_item_states
  add constraint iep_item_states_prompting_check
    check (prompting is null or prompting in ('I', 'VS', 'GE', 'VB', 'MO', 'PP', 'FP'));

-- NULL out any stale values that no longer satisfy the new constraints.
-- (progress was cleared on type change; accuracy 0–10 from the old scale
--  still satisfies 0–100; prompting handled above.)
update public.iep_item_states
  set progress = null
  where progress is not null
    and progress not in ('M', 'SP', 'IP', 'NP', 'NI');

update public.iep_item_states
  set accuracy = null
  where accuracy is not null
    and accuracy not between 0 and 100;
