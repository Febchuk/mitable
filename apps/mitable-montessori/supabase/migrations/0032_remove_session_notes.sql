-- Remove session_notes as a valid classroom program type.
--
-- session_notes was scaffolded as a Progress mode but was superseded by the
-- Reports feature before any production data was recorded with that value.
-- This migration cleans any stale rows and tightens the constraint to only
-- the two live programs: montessori and iep.

-- 1. Strip session_notes from any existing program_types arrays.
update classrooms
  set program_types = array_remove(program_types, 'session_notes')
  where 'session_notes' = any(program_types);

-- 2. Ensure no classroom ends up with an empty array after the strip.
update classrooms
  set program_types = array['montessori']
  where cardinality(program_types) = 0;

-- 3. Replace the constraint.
alter table classrooms
  drop constraint if exists classrooms_program_types_known;

alter table classrooms
  add constraint classrooms_program_types_known
    check (
      cardinality(program_types) > 0
      and program_types <@ array['montessori', 'iep']::text[]
    );
