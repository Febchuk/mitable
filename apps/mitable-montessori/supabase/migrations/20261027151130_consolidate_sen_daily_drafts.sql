-- Consolidate a linked SEN draft and a separate daily draft in one transaction.
-- The API computes report sections; revision checks reject stale source snapshots.
create function public.consolidate_sen_daily_drafts(
  p_canonical_report_id uuid,
  p_duplicate_report_id uuid,
  p_actor_user_id uuid,
  p_school_id uuid,
  p_expected_canonical_updated_at timestamptz,
  p_expected_duplicate_updated_at timestamptz,
  p_patch jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_canonical public.reports%rowtype;
  v_duplicate public.reports%rowtype;
  v_actor_role text;
  v_sen_id uuid;
  v_toddler_id uuid;
begin
  if p_canonical_report_id is null or p_duplicate_report_id is null
     or p_canonical_report_id = p_duplicate_report_id then
    raise exception using errcode = '22023', message = 'Two different report drafts are required';
  end if;

  select u.role into v_actor_role
  from public.users u
  where u.id = p_actor_user_id and u.school_id = p_school_id and u.status = 'active';
  if v_actor_role is null then
    raise exception using errcode = '42501', message = 'An active school user is required';
  end if;

  -- Consistent lock ordering prevents two consolidation attempts deadlocking.
  -- FOR UPDATE also blocks new child rows from referencing either source mid-merge.
  perform r.id from public.reports r
  where r.id in (p_canonical_report_id, p_duplicate_report_id)
  order by r.id for update;
  select r.* into v_canonical from public.reports r where r.id = p_canonical_report_id;
  select r.* into v_duplicate from public.reports r where r.id = p_duplicate_report_id;
  if v_canonical.id is null or v_duplicate.id is null then
    raise exception using errcode = '40001', message = 'A source draft changed or was removed; prepare the report again';
  end if;
  if v_canonical.status not in ('draft', 'changes_requested')
     or v_duplicate.status not in ('draft', 'changes_requested') then
    raise exception using errcode = '40001', message = 'Only editable drafts can be combined';
  end if;
  if v_canonical.updated_at is distinct from p_expected_canonical_updated_at
     or v_duplicate.updated_at is distinct from p_expected_duplicate_updated_at then
    raise exception using errcode = '40001', message = 'A source draft was edited; prepare the report again';
  end if;
  if v_canonical.student_id <> v_duplicate.student_id
     or v_canonical.classroom_id <> v_duplicate.classroom_id
     or v_canonical.report_date is null
     or v_canonical.report_date is distinct from v_duplicate.report_date
     or v_canonical.report_type not in ('sen', 'daily')
     or v_duplicate.report_type <> 'daily'
     or v_canonical.sen_daily_report_id is null
     or v_duplicate.sen_daily_report_id is not null then
    raise exception using errcode = '22023', message = 'The drafts must belong to the same child, classroom and date';
  end if;
  if not exists (
    select 1 from public.students s join public.classrooms c on c.id = v_canonical.classroom_id
    where s.id = v_canonical.student_id and s.school_id = p_school_id and c.school_id = p_school_id
  ) then
    raise exception using errcode = '42501', message = 'The drafts do not belong to this school';
  end if;
  if v_actor_role <> 'admin' and (
    v_canonical.created_by_user_id is distinct from p_actor_user_id
    or v_duplicate.created_by_user_id is distinct from p_actor_user_id
    or not exists (
      select 1 from public.classroom_teacher_assignments a
      where a.classroom_id = v_canonical.classroom_id
        and a.teacher_user_id = p_actor_user_id and a.end_date is null
    )
  ) then
    raise exception using errcode = '42501', message = 'Only the assigned author or a school admin can combine these drafts';
  end if;
  if exists (
    select 1 from public.report_recipients rr
    where rr.report_id in (p_canonical_report_id, p_duplicate_report_id)
  ) then
    raise exception using errcode = '40001', message = 'A report with parent deliveries cannot be combined';
  end if;

  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object'
     or pg_catalog.jsonb_typeof(p_patch -> 'sections') is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_patch -> 'section_meta') is distinct from 'object'
     or pg_catalog.jsonb_typeof(p_patch -> 'section_guidance') is distinct from 'object'
     or p_patch ->> 'report_type' is distinct from 'daily'
     or exists (
       select 1 from pg_catalog.jsonb_object_keys(p_patch) k(key)
       where k.key not in ('sections', 'section_meta', 'section_guidance', 'sen_daily_report_id',
                          'report_type', 'toddler_daily_log_id', 'title', 'body')
     ) then
    raise exception using errcode = '22023', message = 'Invalid combined report fields';
  end if;
  v_sen_id := (p_patch ->> 'sen_daily_report_id')::uuid;
  v_toddler_id := (p_patch ->> 'toddler_daily_log_id')::uuid;
  if v_sen_id is distinct from v_canonical.sen_daily_report_id or not exists (
    select 1 from public.sen_daily_reports s
    join public.sen_report_groups g on g.id = s.sen_report_group_id
    where s.id = v_sen_id and s.school_id = p_school_id
      and g.school_id = p_school_id and g.classroom_id = v_canonical.classroom_id
      and s.student_id = v_canonical.student_id and s.report_date = v_canonical.report_date
  ) then
    raise exception using errcode = '22023', message = 'The SEN assessment does not match the drafts';
  end if;
  if v_toddler_id is not null and not exists (
    select 1 from public.toddler_daily_logs l
    where l.id = v_toddler_id and l.school_id = p_school_id
      and l.student_id = v_canonical.student_id and l.classroom_id = v_canonical.classroom_id
      and l.log_date = v_canonical.report_date
  ) then
    raise exception using errcode = '22023', message = 'The daily activity log does not match the drafts';
  end if;

  update public.reports set
    sections = p_patch -> 'sections',
    section_meta = p_patch -> 'section_meta',
    section_guidance = p_patch -> 'section_guidance',
    sen_daily_report_id = v_sen_id,
    report_type = 'daily',
    toddler_daily_log_id = v_toddler_id,
    title = p_patch ->> 'title',
    body = null,
    updated_at = pg_catalog.clock_timestamp()
  where id = p_canonical_report_id;

  update public.report_review_actions set report_id = p_canonical_report_id
  where report_id = p_duplicate_report_id;
  update public.report_chat_messages set report_id = p_canonical_report_id
  where report_id = p_duplicate_report_id;
  update public.report_chat_artifacts set report_id = p_canonical_report_id
  where report_id = p_duplicate_report_id;

  -- A reviewer may be assigned to both sources. Keep the canonical assignment,
  -- and retain the entire conflicting assignment in the chronological history.
  perform rr.id from public.report_reviewers rr
  where rr.report_id in (p_canonical_report_id, p_duplicate_report_id)
  order by rr.id for update;
  insert into public.report_review_actions (report_id, action_by_user_id, action_type, notes)
  select p_canonical_report_id, p_actor_user_id, 'commented',
    'Reviewer assignment preserved while combining daily draft: ' || pg_catalog.to_jsonb(d)::text
  from public.report_reviewers d
  where d.report_id = p_duplicate_report_id and exists (
    select 1 from public.report_reviewers c
    where c.report_id = p_canonical_report_id and c.reviewer_user_id = d.reviewer_user_id
  );
  delete from public.report_reviewers d
  where d.report_id = p_duplicate_report_id and exists (
    select 1 from public.report_reviewers c
    where c.report_id = p_canonical_report_id and c.reviewer_user_id = d.reviewer_user_id
  );
  update public.report_reviewers set report_id = p_canonical_report_id
  where report_id = p_duplicate_report_id;

  delete from public.reports where id = p_duplicate_report_id;
  insert into public.report_review_actions (report_id, action_by_user_id, action_type, notes)
  values (p_canonical_report_id, p_actor_user_id, 'edited',
    'Combined daily draft ' || p_duplicate_report_id::text || ' with this SEN report');
  return p_canonical_report_id;
end;
$$;

revoke all on function public.consolidate_sen_daily_drafts(uuid, uuid, uuid, uuid, timestamptz, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.consolidate_sen_daily_drafts(uuid, uuid, uuid, uuid, timestamptz, timestamptz, jsonb)
  to service_role;
