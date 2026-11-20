-- TLP supplies its own scale. No assumed score ranges are seeded.
create table public.elementary_grading_scales (
  school_id uuid primary key references public.schools(id) on delete cascade,
  a_min numeric(5,2) not null,
  b_min numeric(5,2) not null,
  c_min numeric(5,2) not null,
  updated_at timestamptz not null default now(),
  constraint ordered_grade_thresholds check (100 >= a_min and a_min > b_min and b_min > c_min and c_min > 0)
);
alter table public.elementary_grading_scales enable row level security;
grant select, insert, update, delete on public.elementary_grading_scales to authenticated;
create policy "school staff read grading scale" on public.elementary_grading_scales for select to authenticated
  using (school_id = public.current_user_school_id());
create policy "school admins manage grading scale" on public.elementary_grading_scales for all to authenticated
  using (school_id = public.current_user_school_id() and public.current_user_is_admin())
  with check (school_id = public.current_user_school_id() and public.current_user_is_admin());
