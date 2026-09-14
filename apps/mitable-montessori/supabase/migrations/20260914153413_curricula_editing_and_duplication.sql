-- Curriculum-management: protect each school's curriculum names and provide an
-- atomic, RLS-respecting copy operation for the admin experience.

-- There were two empty "Health Science" rows in the development data. Keep both
-- records (rather than dropping one) while making the later one unambiguous
-- before enforcing the new uniqueness rule.
with ranked_duplicates as (
  select
    id,
    row_number() over (
      partition by school_id, lower(btrim(name))
      order by created_at, id
    ) as duplicate_number
  from public.curricula
  where school_id = 'fdaa4b18-f030-4984-8a45-e6ba4a6c854f'::uuid
    and lower(btrim(name)) = 'health science'
)
update public.curricula as curricula
set name = btrim(curricula.name) || ' (Copy ' || ranked_duplicates.duplicate_number || ')',
    updated_at = now()
from ranked_duplicates
where curricula.id = ranked_duplicates.id
  and ranked_duplicates.duplicate_number > 1;

-- A display name is unique within a school, ignoring accidental casing or outer
-- whitespace differences. Schools remain independent tenants.
create unique index curricula_school_normalized_name_key
  on public.curricula (school_id, lower(btrim(name)));

-- Copy a curriculum's complete teaching tree in one transaction. This is
-- SECURITY INVOKER (the default): RLS still controls which curriculum an admin
-- may copy, and the function explicitly restricts callers to administrators.
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
  duplicate_subject_id uuid;
  source_topic public.curriculum_topics%rowtype;
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

  select *
  into source_curriculum
  from public.curricula
  where id = source_curriculum_id
    and school_id = nullif(auth.jwt() ->> 'school_id', '')::uuid;

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
    select *
    from public.curriculum_subjects
    where curriculum_id = source_curriculum.id
    order by sort_order, id
  loop
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
      select *
      from public.curriculum_topics
      where subject_id = source_subject.id
      order by sort_order, id
    loop
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
        name,
        sort_order,
        is_active,
        aliases
      from public.curriculum_subtopics
      where topic_id = source_topic.id
      order by sort_order, id;
    end loop;
  end loop;

  return duplicate_curriculum_id;
end;
$$;

revoke all on function public.duplicate_curriculum(uuid, text) from public;
grant execute on function public.duplicate_curriculum(uuid, text) to authenticated;
