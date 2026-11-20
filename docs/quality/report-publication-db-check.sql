-- Disposable verification. No email provider is invoked; every fixture is rolled back.
begin;
do $$
declare actor uuid; room uuid; school uuid; child uuid; guardian uuid; rid uuid; clone uuid;
  legacy uuid; before_count bigint;
  snapshot jsonb; first_send jsonb; duplicate_send jsonb; updated_send jsonb;
begin
  select u.id,u.school_id,a.classroom_id into actor,school,room
  from public.users u join public.classroom_teacher_assignments a on a.teacher_user_id=u.id and a.end_date is null
  where u.email='teacher@example.school' limit 1;
  if actor is null then raise exception 'QA teacher not found'; end if;
  insert into public.students(school_id,first_name,last_name) values(school,'Publication','Rollback QA') returning id into child;
  insert into public.guardians(school_id,first_name,last_name,email) values(school,'QA','Guardian','tlp-quality@example.invalid') returning id into guardian;
  insert into public.student_guardians(student_id,guardian_id,relationship,receives_reports) values(child,guardian,'guardian',true);
  insert into public.reports(student_id,classroom_id,report_type,report_date,status,created_by_user_id,title,body,sections,section_meta)
    values(child,room,'incident','2026-11-19','draft',actor,'QA report','Version one','[]','{}') returning id into rid;
  select public.safe_report_snapshot(to_jsonb(r)) into snapshot from public.reports r where r.id=rid;
  first_send:=public.publish_report(rid,actor,null,snapshot,array[guardian],null);
  duplicate_send:=public.publish_report(rid,actor,null,snapshot,array[guardian],null);
  if (first_send->>'queued')::int<>1 or (duplicate_send->>'queued')::int<>0 then raise exception 'Repeated send queued twice'; end if;
  insert into public.reports(student_id,classroom_id,report_type,report_date,status,created_by_user_id,title,body,sections,section_meta)
    values(child,room,'incident','2026-11-19','draft',actor,'QA report','Version one','[]','{}') returning id into clone;
  select public.safe_report_snapshot(to_jsonb(r)) into snapshot from public.reports r where r.id=clone;
  duplicate_send:=public.publish_report(clone,actor,null,snapshot,array[guardian],null);
  if (duplicate_send->>'queued')::int<>0 or duplicate_send->>'reportId'<>rid::text then raise exception 'Identical cloned report not deduplicated'; end if;
  update public.reports set status='draft',body='Version two' where id=rid;
  if not exists(select 1 from public.report_publications p where report_id=rid and p.snapshot->>'body'='Version one') then raise exception 'Published version disappeared during correction'; end if;
  select public.safe_report_snapshot(to_jsonb(r)) into snapshot from public.reports r where r.id=rid;
  updated_send:=public.publish_report(rid,actor,null,snapshot,array[guardian],null);
  if (updated_send->>'queued')::int<>1 or (select count(*) from public.report_publications where report_id=rid)<>2 then raise exception 'Material update failed'; end if;
  if has_function_privilege('authenticated','public.publish_report(uuid,uuid,timestamp with time zone,jsonb,uuid[],text)','execute') then raise exception 'Browser can invoke service publication'; end if;
  if public.safe_report_snapshot('{"ai_reasoning":"private","title":"public"}') ? 'ai_reasoning' then raise exception 'Staff-only information leaked'; end if;
  -- Legacy deployed send remains readable during rollout, without a trigger queuing mail.
  insert into public.reports(student_id,classroom_id,report_type,report_date,status,created_by_user_id,title,body,sections,section_meta)
    values(child,room,'incident','2026-11-18','draft',actor,'Legacy QA','Old deployed send','[]','{}') returning id into legacy;
  select count(*) into before_count from public.report_recipients;
  update public.reports set status='sent',sent_at=clock_timestamp() where id=legacy;
  if (select count(*) from public.report_publications where report_id=legacy)<>1 then raise exception 'Legacy send not captured'; end if;
  if (select count(*) from public.report_recipients)<>before_count then raise exception 'Bridge queued email'; end if;
  insert into public.report_recipients(report_id,guardian_id,email_snapshot,delivery_status) values(legacy,guardian,'tlp-quality@example.invalid','suppressed');
  if exists(select 1 from public.report_recipients where report_id=legacy and publication_id is null) then raise exception 'Legacy recipient not attached'; end if;
  if public.report_content_fingerprint('{"sections":[{"id":"one","heading":"Note","paragraphs":[{"id":"one","html":"<p>Hello  world</p>"}]}]}')
    <>public.report_content_fingerprint('{"sections":[{"id":"two","heading":"Note","paragraphs":[{"id":"two","html":"Hello world"}]}]}') then raise exception 'Formatting-only change treated as material'; end if;
  if public.report_content_fingerprint(jsonb_build_object('sections',jsonb_build_array(jsonb_build_object('paragraphs',jsonb_build_array(jsonb_build_object('html','<a href="https://example.com/one">Open</a>'))))))
    =public.report_content_fingerprint(jsonb_build_object('sections',jsonb_build_array(jsonb_build_object('paragraphs',jsonb_build_array(jsonb_build_object('html','<a href="https://example.com/two">Open</a>')))))) then raise exception 'Material link change ignored'; end if;
end $$;
rollback;
select 'PASS: repeated-send and clone dedupe; material update; prior version retained; private fields filtered; browser RPC denied; legacy rollout bridge queues no emails; formatting ignored but changed links detected. Fixtures rolled back, no email provider invoked.' as result;
