-- Removing a branch also removes its descendants from live curricula, atomically.
-- Progress/history rows remain intact. Invoker privileges retain existing school RLS.
create function public.archive_curriculum_descendants() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name = 'curriculum_subjects' then
    update public.curriculum_topics set is_active = false where subject_id = new.id and is_active;
  elsif tg_table_name = 'curriculum_topics' then
    update public.curriculum_subtopics set is_active = false where topic_id = new.id and is_active;
  end if;
  return new;
end;
$$;
revoke all on function public.archive_curriculum_descendants() from public, anon, authenticated;
create trigger archive_subject_descendants after update of is_active on public.curriculum_subjects
for each row when (old.is_active and not new.is_active) execute function public.archive_curriculum_descendants();
create trigger archive_topic_descendants after update of is_active on public.curriculum_topics
for each row when (old.is_active and not new.is_active) execute function public.archive_curriculum_descendants();
