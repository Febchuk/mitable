-- Add program_types column to classrooms.
--
-- Drives which Progress modes a teacher sees when they open the Progress
-- route for a given classroom. Most rooms are Montessori-only; OT/special-ed
-- rooms typically declare ['iep'], speech rooms typically declare
-- ['session_notes'], and a teacher who runs OT + speech for the same group
-- declares both.
--
-- This migration is required for the admin classrooms page and the teacher
-- Progress route to function. Apply it before deploying the matching app
-- code — both surfaces SELECT this column directly and will 500 without it.

alter table classrooms
  add column if not exists program_types text[] not null default array['montessori']::text[];

-- Constrain to known values. New programs added here must also be added to
-- ProgressProgram in src/lib/queries/progress-programs.ts.
alter table classrooms
  drop constraint if exists classrooms_program_types_known;
alter table classrooms
  add constraint classrooms_program_types_known
    check (
      cardinality(program_types) > 0
      and program_types <@ array['montessori', 'iep', 'session_notes']::text[]
    );

-- Backfill existing rows that may predate the default (idempotent).
update classrooms
  set program_types = array['montessori']
  where program_types is null or cardinality(program_types) = 0;
