-- Qualify nested source-tree reads explicitly. This avoids PL/pgSQL record
-- variable resolution preventing the child loops from seeing their source rows.
create or replace function public.duplicate_curriculum(
  source_curriculum_id uuid,
  new_curriculum_name text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  source_curriculum public.curricula%rowtype;
  duplicate_curriculum_id uuid;
  source_subject public.curriculum_subjects%rowtype;
  source_subject_id uuid;
  duplicate_subject_id uuid;
  source_topic public.curriculum_topics%rowtype;
  source_topic_id uuid;
  duplicate_topic_id uuid;
  requested_name text := btrim(new_curriculum_name);
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'admin' then
    raise exception 'Only administrators can duplicate curricula'
      using errcode = '42501';
  end if;

  if requested_name = '' then
    raise exception 'Curriculum name is required'
      using errcode = '22023';
  end if;

  select c.*
  into source_curriculum
  from public.curricula as c
  where c.id = source_curriculum_id
    and c.school_id = nullif(auth.jwt() ->> 'school_id', '')::uuid;

  if not found then
    raise exception 'Curriculum not found'
      using errcode = 'P0002';
  end if;

  insert into public.curricula (
    school_id,
    name,
    framework,
    description,
    is_active,
    created_by_user_id
  )
  values (
    source_curriculum.school_id,
    requested_name,
    source_curriculum.framework,
    source_curriculum.description,
    source_curriculum.is_active,
    auth.uid()
  )
  returning id into duplicate_curriculum_id;

  for source_subject in
    select s.*
    from public.curriculum_subjects as s
    where s.curriculum_id = source_curriculum_id
    order by s.sort_order, s.id
  loop
    source_subject_id := source_subject.id;

    insert into public.curriculum_subjects (
      curriculum_id,
      name,
      sort_order,
      is_active
    )
    values (
      duplicate_curriculum_id,
      source_subject.name,
      source_subject.sort_order,
      source_subject.is_active
    )
    returning id into duplicate_subject_id;

    for source_topic in
      select t.*
      from public.curriculum_topics as t
      where t.subject_id = source_subject_id
      order by t.sort_order, t.id
    loop
      source_topic_id := source_topic.id;

      insert into public.curriculum_topics (
        curriculum_id,
        subject_id,
        name,
        sort_order,
        is_active,
        marking_schema
      )
      values (
        duplicate_curriculum_id,
        duplicate_subject_id,
        source_topic.name,
        source_topic.sort_order,
        source_topic.is_active,
        source_topic.marking_schema
      )
      returning id into duplicate_topic_id;

      insert into public.curriculum_subtopics (
        topic_id,
        name,
        sort_order,
        is_active,
        aliases
      )
      select
        duplicate_topic_id,
        st.name,
        st.sort_order,
        st.is_active,
        st.aliases
      from public.curriculum_subtopics as st
      where st.topic_id = source_topic_id
      order by st.sort_order, st.id;
    end loop;
  end loop;

  return duplicate_curriculum_id;
end;
$$;
