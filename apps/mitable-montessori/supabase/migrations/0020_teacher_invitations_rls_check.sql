-- 0019 created teacher_invitations with policies using `for all using (…)`,
-- but Postgres requires an explicit `with check` clause for INSERTs to be
-- accepted. Without it, every insert (even from an admin) gets rejected as
-- "new row violates row-level security policy".
--
-- This migration replaces the broad "for all" policies with explicit per-
-- command policies that include both USING and WITH CHECK predicates.

drop policy if exists "admins write teacher invitations" on teacher_invitations;
drop policy if exists "admins read teacher invitations" on teacher_invitations;

create policy "admins read teacher invitations" on teacher_invitations
  for select
  using (
    (auth.jwt() ->> 'role') = 'admin'
    and school_id = (auth.jwt() ->> 'school_id')::uuid
  );

create policy "admins insert teacher invitations" on teacher_invitations
  for insert
  with check (
    (auth.jwt() ->> 'role') = 'admin'
    and school_id = (auth.jwt() ->> 'school_id')::uuid
  );

create policy "admins update teacher invitations" on teacher_invitations
  for update
  using (
    (auth.jwt() ->> 'role') = 'admin'
    and school_id = (auth.jwt() ->> 'school_id')::uuid
  )
  with check (
    (auth.jwt() ->> 'role') = 'admin'
    and school_id = (auth.jwt() ->> 'school_id')::uuid
  );

create policy "admins delete teacher invitations" on teacher_invitations
  for delete
  using (
    (auth.jwt() ->> 'role') = 'admin'
    and school_id = (auth.jwt() ->> 'school_id')::uuid
  );
