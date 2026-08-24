-- A guardian can already read progress for every child they are linked to.
-- These helpers expose only the curriculum labels attached to that visible
-- progress, allowing the parent view to render the existing history.
create or replace function public.guardian_visible_curriculum_subtopic_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct progress.curriculum_subtopic_id
  from public.student_progress as progress
  where progress.student_id in (select public.guardian_visible_student_ids());
$$;

create or replace function public.guardian_visible_curriculum_topic_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct subtopic.topic_id
  from public.curriculum_subtopics as subtopic
  where subtopic.id in (select public.guardian_visible_curriculum_subtopic_ids());
$$;

revoke all on function public.guardian_visible_curriculum_subtopic_ids() from public;
grant execute on function public.guardian_visible_curriculum_subtopic_ids()
  to authenticated, anon, service_role;

revoke all on function public.guardian_visible_curriculum_topic_ids() from public;
grant execute on function public.guardian_visible_curriculum_topic_ids()
  to authenticated, anon, service_role;

create policy "guardians read visible curriculum subtopics"
  on public.curriculum_subtopics
  for select using (
    id in (select public.guardian_visible_curriculum_subtopic_ids())
  );

create policy "guardians read visible curriculum topics"
  on public.curriculum_topics
  for select using (
    id in (select public.guardian_visible_curriculum_topic_ids())
  );
