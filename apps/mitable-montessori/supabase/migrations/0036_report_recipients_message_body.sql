-- 0036 — Add message_body to report_recipients (renumbered from 0027_*: Supabase
-- migration version is the numeric prefix only; 0027_classroom_program_types.sql
-- already owns version 0027 in schema_migrations.)
-- Stores the admin's personal note that accompanies the report email.

alter table report_recipients
  add column if not exists message_body text;
