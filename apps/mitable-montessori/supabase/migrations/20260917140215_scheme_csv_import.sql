-- Import a reviewed scheme as subjects, topics, and one same-named lesson per topic.
-- One RPC call is one transaction. Re-importing a scheme fills missing rows only.
create function public.import_curriculum_scheme(
  p_curriculum_id uuid,
  p_subjects jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subject_item jsonb;
  topic_item jsonb;
  subject_name text;
  topic_name text;
  v_subject_id uuid;
  v_topic_id uuid;
  v_lesson_id uuid;
  subjects_added integer := 0;
  topics_added integer := 0;
  lessons_added integer := 0;
begin
  if (select auth.uid()) is null
    or not (select public.current_user_is_admin())
    or not exists (
      select 1 from public.curricula c
      where c.id = p_curriculum_id
        and c.school_id = (select public.current_user_school_id())
    ) then
    raise exception 'Curriculum not found or admin access required' using errcode = '42501';
  end if;

  if p_subjects is null or jsonb_typeof(p_subjects) <> 'array'
    or jsonb_array_length(p_subjects) > 100 then
    raise exception 'Invalid scheme subjects' using errcode = '22023';
  end if;

  -- Serialise imports into the same curriculum, including simultaneous retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_curriculum_id::text, 0));

  for subject_item in select value from pg_catalog.jsonb_array_elements(p_subjects) loop
    if jsonb_typeof(subject_item) <> 'object'
      or jsonb_typeof(subject_item -> 'topics') <> 'array'
      or jsonb_array_length(subject_item -> 'topics') > 500 then
      raise exception 'Invalid scheme subject' using errcode = '22023';
    end if;
    subject_name := pg_catalog.regexp_replace(pg_catalog.btrim(subject_item ->> 'name'), '[[:space:]]+', ' ', 'g');
    if subject_name is null or subject_name = '' or pg_catalog.length(subject_name) > 200 then
      raise exception 'Invalid subject name' using errcode = '22023';
    end if;

    v_subject_id := null;
    select s.id into v_subject_id
    from public.curriculum_subjects s
    where s.curriculum_id = p_curriculum_id
      and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(s.name), '[[:space:]]+', ' ', 'g')) = pg_catalog.lower(subject_name)
    order by s.sort_order, s.id limit 1;

    if v_subject_id is null then
      insert into public.curriculum_subjects (curriculum_id, name, sort_order)
      values (
        p_curriculum_id, subject_name,
        (select coalesce(max(sort_order), -1) + 1 from public.curriculum_subjects where curriculum_id = p_curriculum_id)
      ) returning id into v_subject_id;
      subjects_added := subjects_added + 1;
    end if;

    for topic_item in select value from pg_catalog.jsonb_array_elements(subject_item -> 'topics') loop
      if jsonb_typeof(topic_item) <> 'string' then
        raise exception 'Invalid scheme topic' using errcode = '22023';
      end if;
      topic_name := pg_catalog.regexp_replace(pg_catalog.btrim(topic_item #>> '{}'), '[[:space:]]+', ' ', 'g');
      if topic_name = '' or pg_catalog.length(topic_name) > 200 then
        raise exception 'Invalid topic name' using errcode = '22023';
      end if;

      v_topic_id := null;
      select t.id into v_topic_id
      from public.curriculum_topics t
      where t.subject_id = v_subject_id
        and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(t.name), '[[:space:]]+', ' ', 'g')) = pg_catalog.lower(topic_name)
      order by t.sort_order, t.id limit 1;

      if v_topic_id is null then
        insert into public.curriculum_topics (curriculum_id, subject_id, name, sort_order)
        values (
          p_curriculum_id, v_subject_id, topic_name,
          (select coalesce(max(sort_order), -1) + 1 from public.curriculum_topics where subject_id = v_subject_id)
        ) returning id into v_topic_id;
        topics_added := topics_added + 1;
      end if;

      v_lesson_id := null;
      select st.id into v_lesson_id
      from public.curriculum_subtopics st
      where st.topic_id = v_topic_id
        and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(st.name), '[[:space:]]+', ' ', 'g')) = pg_catalog.lower(topic_name)
      order by st.sort_order, st.id limit 1;

      if v_lesson_id is null then
        insert into public.curriculum_subtopics (topic_id, name, sort_order)
        values (
          v_topic_id, topic_name,
          (select coalesce(max(sort_order), -1) + 1 from public.curriculum_subtopics where topic_id = v_topic_id)
        );
        lessons_added := lessons_added + 1;
      end if;
    end loop;
  end loop;

  return pg_catalog.jsonb_build_object(
    'subjectsAdded', subjects_added,
    'topicsAdded', topics_added,
    'lessonsAdded', lessons_added
  );
end;
$$;

revoke all on function public.import_curriculum_scheme(uuid, jsonb) from public, anon;
grant execute on function public.import_curriculum_scheme(uuid, jsonb) to authenticated;
