create or replace function public.report_content_fingerprint(doc jsonb) returns text
language sql immutable security invoker set search_path='' as $$
  select md5(jsonb_build_object(
    'student',doc->'student_id','classroom',doc->'classroom_id','type',doc->'report_type',
    'date',doc->'report_date','start',doc->'period_start','end',doc->'period_end','term',doc->'term_id',
    'title',btrim(regexp_replace(coalesce(doc->>'title',''),'\s+',' ','g')),
    'logo',doc->'template_logo_url','meta',doc->'section_meta',
    'targets', (select jsonb_agg(m[1] order by ord) from regexp_matches(coalesce(doc->'sections','[]'::jsonb)::text, '(?:href|src)=\"([^\"]+)\"', 'g') with ordinality as links(m,ord)),
    'sections',coalesce((select jsonb_agg(jsonb_build_object('heading',section->>'heading','paragraphs',
      (select jsonb_agg(btrim(regexp_replace(case when p->>'html' like '__MITABLE_%' then p->>'html'
        else regexp_replace(coalesce(p->>'html',''),'<[^>]*>','','g') end,'\s+',' ','g')) order by pi)
       from jsonb_array_elements(case when jsonb_typeof(section->'paragraphs')='array' then section->'paragraphs' else '[]'::jsonb end) with ordinality as paragraphs(p,pi))) order by si)
      from jsonb_array_elements(case when jsonb_typeof(doc->'sections')='array' then doc->'sections' else '[]'::jsonb end) with ordinality as sections(section,si)), '[]'::jsonb),
    'body',case when jsonb_array_length(case when jsonb_typeof(doc->'sections')='array' then doc->'sections' else '[]'::jsonb end)=0 then doc->>'body' else null end
  )::text);
$$;
revoke all on function public.report_content_fingerprint(jsonb) from public,anon,authenticated;
grant execute on function public.report_content_fingerprint(jsonb) to service_role;

create or replace function public.publish_report(p_report_id uuid,p_actor_id uuid,p_expected_updated_at timestamptz,p_snapshot jsonb,p_guardian_ids uuid[],p_message_body text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.reports%rowtype; prior public.report_publications%rowtype; actor public.users%rowtype;
  school uuid; publication uuid; canonical_report uuid; fingerprint text; recipient record;
  queued integer:=0; already integer:=0; eligible integer:=0; addresses text[]:='{}'; address text;
begin
  p_snapshot:=public.safe_report_snapshot(p_snapshot);
  select * into actor from public.users where id=p_actor_id and status='active';
  if actor.id is null or actor.role not in ('teacher','admin') then raise exception 'Staff access required'; end if;
  select * into r from public.reports where id=p_report_id;
  select school_id into school from public.students where id=r.student_id;
  if r.id is null or school is distinct from actor.school_id then raise exception 'Report not found in your school'; end if;
  if actor.role='teacher' and not exists(select 1 from public.classroom_teacher_assignments where classroom_id=r.classroom_id and teacher_user_id=actor.id and end_date is null) then
    raise exception 'Classroom access denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(school::text||':'||r.student_id::text||':'||r.report_type||':'||r.report_date::text,0));
  select * into r from public.reports where id=p_report_id for update;
  if p_snapshot->>'student_id' is distinct from r.student_id::text or p_snapshot->>'classroom_id' is distinct from r.classroom_id::text
    or p_snapshot->>'report_type' is distinct from r.report_type or p_snapshot->>'report_date' is distinct from r.report_date::text then raise exception 'Report scope changed'; end if;
  fingerprint:=public.report_content_fingerprint(p_snapshot);
  select * into prior from public.report_publications where school_id=school and student_id=r.student_id and report_type=r.report_type and report_date=r.report_date order by published_at desc,id desc limit 1;
  if prior.id is not null and prior.content_hash=fingerprint then
    publication:=prior.id; canonical_report:=prior.report_id;
  else
    if r.status not in ('draft','changes_requested','approved') then raise exception 'Report must be explicitly prepared before sending an update'; end if;
    if p_expected_updated_at is not null and r.updated_at is distinct from p_expected_updated_at then raise exception 'Report changed while sending; reload and review it'; end if;
    perform set_config('mitable.explicit_publication','on',true);
    update public.reports set status='sent',sent_at=now(),updated_at=now(),
      sections=p_snapshot->'sections',section_meta=p_snapshot->'section_meta',body=p_snapshot->>'body'
      where id=r.id;
    perform set_config('mitable.explicit_publication','off',true);
    insert into public.report_publications(report_id,school_id,student_id,classroom_id,report_type,report_date,snapshot,content_hash,published_by_user_id)
      values(r.id,school,r.student_id,r.classroom_id,r.report_type,r.report_date,p_snapshot,fingerprint,actor.id) returning id into publication;
    canonical_report:=r.id;
    insert into public.report_review_actions(report_id,action_by_user_id,action_type,notes) values(r.id,actor.id,'sent','Explicit publication');
  end if;
  select coalesce(array_agg(distinct lower(btrim(email_snapshot))),'{}') into addresses from public.report_recipients where publication_id=publication and delivery_status<>'suppressed';
  for recipient in select distinct g.id,g.email from public.guardians g join public.student_guardians sg on sg.guardian_id=g.id
    where sg.student_id=r.student_id and sg.receives_reports and g.school_id=school and g.id=any(p_guardian_ids)
  loop
    eligible:=eligible+1;
    if exists(select 1 from public.report_recipients where publication_id=publication and guardian_id=recipient.id) then already:=already+1; continue; end if;
    address:=lower(btrim(coalesce(recipient.email,'')));
    insert into public.report_recipients(report_id,publication_id,guardian_id,email_snapshot,delivery_status,message_body)
      values(canonical_report,publication,recipient.id,nullif(address,''),case when address=any(addresses) then 'suppressed' else 'pending' end,p_message_body);
    if not address=any(addresses) then queued:=queued+1; addresses:=array_append(addresses,address); end if;
  end loop;
  if cardinality(p_guardian_ids)>0 and eligible=0 then raise exception 'No eligible recipients'; end if;
  return jsonb_build_object('reportId',canonical_report,'publicationId',publication,'queued',queued,'alreadySent',already,'unchanged',prior.id=publication);
end;
$$;
revoke all on function public.publish_report(uuid,uuid,timestamptz,jsonb,uuid[],text) from public,anon,authenticated;
grant execute on function public.publish_report(uuid,uuid,timestamptz,jsonb,uuid[],text) to service_role;

-- Preserve explicit sends from the previously deployed app during a rolling release.
-- This trigger records access only. It never creates recipients or sends email.
create function public.capture_legacy_report_publication() returns trigger
language plpgsql security definer set search_path='' as $$
declare doc jsonb; school uuid;
begin
  if current_setting('mitable.explicit_publication',true)='on' then return new; end if;
  select s.school_id,public.safe_report_snapshot(to_jsonb(new)||jsonb_build_object(
    'template_logo_url',t.logo_url,'school_name',sc.name,'student_name',concat_ws(' ',coalesce(s.preferred_name,s.first_name),s.last_name)))
    into school,doc from public.students s join public.schools sc on sc.id=s.school_id
    left join public.report_templates t on t.id=new.template_id and t.school_id=s.school_id where s.id=new.student_id;
  insert into public.report_publications(report_id,school_id,student_id,classroom_id,report_type,report_date,snapshot,content_hash,published_by_user_id,published_at)
    values(new.id,school,new.student_id,new.classroom_id,new.report_type,new.report_date,doc,public.report_content_fingerprint(doc),new.created_by_user_id,coalesce(new.sent_at,clock_timestamp()));
  return new;
end $$;
revoke all on function public.capture_legacy_report_publication() from public,anon,authenticated;
create trigger capture_legacy_report_publication after update of status on public.reports
  for each row when(new.status='sent' and old.status is distinct from new.status)
  execute function public.capture_legacy_report_publication();

create function public.attach_legacy_report_recipient() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.publication_id is null then
    select id into new.publication_id from public.report_publications where report_id=new.report_id order by published_at desc,id desc limit 1;
  end if;
  return new;
end $$;
revoke all on function public.attach_legacy_report_recipient() from public,anon,authenticated;
create trigger attach_legacy_report_recipient before insert on public.report_recipients
  for each row when(new.publication_id is null) execute function public.attach_legacy_report_recipient();

-- Catch reports explicitly sent between the initial backfill and this migration.
insert into public.report_publications(report_id,school_id,student_id,classroom_id,report_type,report_date,snapshot,content_hash,published_by_user_id,published_at)
select r.id,s.school_id,r.student_id,r.classroom_id,r.report_type,r.report_date,
 public.safe_report_snapshot(to_jsonb(r)||jsonb_build_object('template_logo_url',t.logo_url,'school_name',school.name,'student_name',concat_ws(' ',coalesce(s.preferred_name,s.first_name),s.last_name))),
 public.report_content_fingerprint(to_jsonb(r)||jsonb_build_object('template_logo_url',t.logo_url)),r.created_by_user_id,coalesce(r.sent_at,r.updated_at)
from public.reports r join public.students s on s.id=r.student_id join public.schools school on school.id=s.school_id
left join public.report_templates t on t.id=r.template_id and t.school_id=s.school_id
where r.status='sent' and not exists(select 1 from public.report_publications p where p.report_id=r.id);
update public.report_recipients rr set publication_id=p.id from public.report_publications p where p.report_id=rr.report_id and rr.publication_id is null;
update public.report_publications set content_hash=public.report_content_fingerprint(snapshot);
alter table public.report_publications alter column published_at set default clock_timestamp();
