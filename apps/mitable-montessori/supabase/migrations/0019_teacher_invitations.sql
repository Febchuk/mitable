-- Teacher invitations.
--
-- Symmetric to guardian_invitations, with one difference: guardians have a
-- pre-existing `guardians` row to point at, but admins/teachers share one
-- `users` table where `users.id = auth.users.id`. We can't insert a `users`
-- row until the auth user exists (i.e. at claim time). So pending teacher
-- invites carry their own email + school_id on the invitation row, and the
-- `users` row gets created during the claim flow once we have the auth uid.
--
-- Flow:
--   1. Admin POSTs N emails. We insert one teacher_invitations row per email
--      with a hashed random token. The plaintext token goes out via Resend.
--   2. Teacher clicks the link, lands on /teachers/claim?token=…, sets a
--      password (and optionally first/last name).
--   3. Claim endpoint validates the token, creates the auth.users row via
--      supabase.auth.signUp, then inserts the `users` row using the new auth
--      uid as `users.id`, and stamps `teacher_invitations.claimed_at` +
--      `claimed_user_id`.

create table if not exists teacher_invitations (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools(id),
  email               text not null,
  token_hash          text not null unique,
  expires_at          timestamptz not null,
  claimed_at          timestamptz,
  claimed_user_id     uuid references users(id),
  invited_by_user_id  uuid not null references users(id),
  created_at          timestamptz not null default now()
);

create index if not exists idx_teacher_invitations_school on teacher_invitations(school_id);
create index if not exists idx_teacher_invitations_email on teacher_invitations(school_id, lower(email));
create index if not exists idx_teacher_invitations_unclaimed on teacher_invitations(claimed_at) where claimed_at is null;

-- A given school can only have one *active* (unclaimed, unexpired) invitation
-- per email. Resending intentionally invalidates the prior token in app code,
-- so we don't enforce this with a partial unique index — it'd block legitimate
-- "issue, expire, re-issue" sequences. Email uniqueness on the live `users`
-- row remains enforced by `unique (school_id, email)` from 0001_init.

alter table teacher_invitations enable row level security;

-- Same-school admins can read + write invitations they own.
drop policy if exists "admins write teacher invitations" on teacher_invitations;
create policy "admins write teacher invitations" on teacher_invitations for all using (
  (auth.jwt() ->> 'role') = 'admin'
  and school_id = (auth.jwt() ->> 'school_id')::uuid
);

-- Same-school admins can read invitations regardless of who sent them
-- (an invite from a previous admin should still appear in the roster).
drop policy if exists "admins read teacher invitations" on teacher_invitations;
create policy "admins read teacher invitations" on teacher_invitations for select using (
  (auth.jwt() ->> 'role') = 'admin'
  and school_id = (auth.jwt() ->> 'school_id')::uuid
);
