-- Add a free-text `sex` column to students.
--
-- The Child Detail "i" tooltip displays this row alongside Born / Classroom /
-- Enrolled / Allergies. Free-text (no CHECK constraint) so the column can hold
-- whatever an admin enters — "Female", "Male", "Non-binary", or anything else.
-- Existing students RLS policies cover SELECT for the new column unchanged.

alter table public.students add column if not exists sex text;
