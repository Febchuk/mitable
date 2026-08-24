-- Parents authenticate through guardians rather than the staff users table.
-- Let an authenticated guardian read their own profile and student links.
create policy "guardians read own profile" on guardians
  for select using (auth_user_id = auth.uid());

create policy "guardians read own student links" on student_guardians
  for select using (guardian_id = public.current_guardian_id());
