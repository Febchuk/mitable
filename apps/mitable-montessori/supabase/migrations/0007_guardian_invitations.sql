-- Phase 5 guardian invitations + RLS for the parent (guardian) read-only app.
--
-- The flow is:
--   1. Admin issues an invitation for a `guardians.id` row that already exists.
--      A token (random, server-side) is hashed and stored; the plaintext token
--      goes out in an email with a one-time URL.
--   2. Guardian clicks the link, sets a password — Supabase Auth creates the
--      auth.users row, and we mirror it in `users` for FK consistency.
--   3. The claim endpoint validates the token, links the new auth user to the
--      existing `guardians.id` via `guardians.auth_user_id`, and stamps the
--      JWT claim `guardian_id` so RLS can enforce read-only scope.

-- =============================================================================
-- 1. Invitations table
-- =============================================================================

create table if not exists guardian_invitations (
  id                  uuid primary key default gen_random_uuid(),
  guardian_id         uuid not null references guardians(id),
  token_hash          text not null unique,
  expires_at          timestamptz not null,
  claimed_at          timestamptz,
  invited_by_user_id  uuid not null references users(id),
  created_at          timestamptz not null default now()
);

create index if not exists idx_guardian_invitations_guardian on guardian_invitations(guardian_id);
create index if not exists idx_guardian_invitations_unclaimed on guardian_invitations(claimed_at) where claimed_at is null;

-- Couple the auth user to the canonical guardian row (a guardian can exist
-- before they claim — admins enroll them at the same time they enroll the
-- student).
alter table guardians add column if not exists auth_user_id uuid unique;

-- =============================================================================
-- 2. Guardian-scoped read RLS
-- =============================================================================

-- Existing 0002_rls baseline already added "guardians see linked students" /
-- "guardians see sent reports". Phase 5 expands to attendance + progress and
-- adds a defense-in-depth guard via the guardian_invitations table.

drop policy if exists "guardians see linked attendance" on attendance_records;
create policy "guardians see linked attendance" on attendance_records for select using (
  student_id in (
    select student_id from student_guardians
    where guardian_id = (auth.jwt() ->> 'guardian_id')::uuid
  )
);

drop policy if exists "guardians see linked progress" on student_progress;
create policy "guardians see linked progress" on student_progress for select using (
  student_id in (
    select student_id from student_guardians
    where guardian_id = (auth.jwt() ->> 'guardian_id')::uuid
  )
);

-- A guardian sees `sent` reports only when (a) the report is linked to one of
-- their students, AND (b) `student_guardians.receives_reports = true` for
-- that pairing. Re-stating with both clauses so receives_reports=false hides
-- the report even if someone forgot to add a report_recipients row.
drop policy if exists "guardians see sent reports v2" on reports;
create policy "guardians see sent reports v2" on reports for select using (
  status = 'sent'
  and student_id in (
    select student_id from student_guardians
    where guardian_id = (auth.jwt() ->> 'guardian_id')::uuid
      and receives_reports = true
  )
);

-- Invitations: only admins write; only the matching guardian (after claim)
-- can read their own row.
alter table guardian_invitations enable row level security;

drop policy if exists "admins write invitations" on guardian_invitations;
create policy "admins write invitations" on guardian_invitations for all using (
  (auth.jwt() ->> 'role') = 'admin'
  and invited_by_user_id in (
    select id from users where school_id = (auth.jwt() ->> 'school_id')::uuid
  )
);

drop policy if exists "guardians read own invitation" on guardian_invitations;
create policy "guardians read own invitation" on guardian_invitations for select using (
  guardian_id = (auth.jwt() ->> 'guardian_id')::uuid
);
