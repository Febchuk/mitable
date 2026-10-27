-- Run after the consolidation migration with a privileged SQL connection:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/consolidate_sen_daily_drafts.sql
-- Uses a new synthetic school and random IDs only. Every fixture is rolled back.
begin;
set local role service_role;

do $$
declare
  v_school uuid := gen_random_uuid();
  v_teacher uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_other_teacher uuid := gen_random_uuid();
  v_room uuid := gen_random_uuid();
  v_student uuid := gen_random_uuid();
  v_template uuid := gen_random_uuid();
  v_group uuid := gen_random_uuid();
  v_sen uuid := gen_random_uuid();
  v_canonical uuid := gen_random_uuid();
  v_duplicate uuid := gen_random_uuid();
  v_action uuid := gen_random_uuid();
  v_message uuid := gen_random_uuid();
  v_artifact uuid := gen_random_uuid();
  v_reviewer uuid := gen_random_uuid();
  v_guardian uuid := gen_random_uuid();
  v_day date := '2026-10-20';
  v_revision timestamptz := '2026-10-20T12:00:00Z';
  v_patch jsonb;
  v_result uuid;
  v_function text := 'public.consolidate_sen_daily_drafts(uuid,uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,jsonb)';
begin
  assert not has_function_privilege('anon', v_function, 'EXECUTE'), 'anon must not execute consolidation';
  assert not has_function_privilege('authenticated', v_function, 'EXECUTE'), 'browser sessions must not execute consolidation';
  assert has_function_privilege('service_role', v_function, 'EXECUTE'), 'service role must execute consolidation';

  insert into public.schools (id, name, timezone) values (v_school, 'SYNTHETIC consolidation rollback test', 'Africa/Lagos');
  insert into public.users (id, school_id, role, email, status) values
    (v_teacher, v_school, 'teacher', 'teacher-' || v_teacher || '@example.invalid', 'active'),
    (v_admin, v_school, 'admin', 'admin-' || v_admin || '@example.invalid', 'active'),
    (v_other_teacher, v_school, 'teacher', 'other-' || v_other_teacher || '@example.invalid', 'active');
  insert into public.classrooms (id, school_id, name, code) values (v_room, v_school, 'Synthetic room', 'Toddler');
  insert into public.classroom_teacher_assignments (classroom_id, teacher_user_id, start_date)
    values (v_room, v_teacher, v_day);
  insert into public.students (id, school_id, first_name, last_name) values (v_student, v_school, 'Synthetic', 'Learner');
  insert into public.student_classroom_enrollments (student_id, classroom_id, start_date)
    values (v_student, v_room, v_day);
  insert into public.sen_report_templates (id, school_id, name) values (v_template, v_school, 'Synthetic template');
  insert into public.sen_report_groups (id, school_id, classroom_id, template_id, name)
    values (v_group, v_school, v_room, v_template, 'Synthetic group');
  insert into public.sen_report_group_members (sen_report_group_id, student_id, joined_on)
    values (v_group, v_student, v_day);
  insert into public.sen_daily_reports (id, school_id, sen_report_group_id, student_id, report_date, created_by_user_id)
    values (v_sen, v_school, v_group, v_student, v_day, v_teacher);
  insert into public.reports
    (id, student_id, classroom_id, report_type, report_date, status, sen_daily_report_id, created_by_user_id, title, sections, updated_at)
  values
    (v_canonical, v_student, v_room, 'sen', v_day, 'draft', v_sen, v_teacher, 'Original SEN', '[]', v_revision),
    (v_duplicate, v_student, v_room, 'daily', v_day, 'changes_requested', null, v_teacher, 'Original Daily',
     '[{"id":"teacher-note","heading":"Teacher note","paragraphs":[{"id":"note-text","html":"Preserve this teacher addition."}]}]', v_revision);

  -- This real NO ACTION foreign key blocked the previous separate DELETE.
  insert into public.report_review_actions (id, report_id, action_by_user_id, action_type, notes)
    values (v_action, v_duplicate, v_admin, 'requested_changes', 'Preserve review history');
  insert into public.report_chat_messages (id, report_id, role, kind, payload, actor_role, created_by_user_id)
    values (v_message, v_duplicate, 'user', 'user-text', '{"body":"Preserve chat history"}', 'teacher', v_teacher);
  insert into public.report_chat_artifacts (id, report_id, kind, ocr_text, created_by_user_id)
    values (v_artifact, v_duplicate, 'transcript', 'Preserve voice transcript', v_teacher);
  insert into public.report_reviewers (report_id, reviewer_user_id, assigned_by_user_id, status, note)
    values (v_canonical, v_teacher, v_admin, 'approved', 'Canonical assignment');
  insert into public.report_reviewers (report_id, reviewer_user_id, assigned_by_user_id, status, note)
    values (v_duplicate, v_teacher, v_admin, 'changes_requested', 'Duplicate reviewer note');
  insert into public.report_reviewers (id, report_id, reviewer_user_id, assigned_by_user_id)
    values (v_reviewer, v_duplicate, v_admin, v_teacher);

  v_patch := jsonb_build_object(
    'sections', '[{"id":"daily","heading":"Daily log","paragraphs":[]},{"id":"teacher-note","heading":"Teacher note","paragraphs":[{"id":"note-text","html":"Preserve this teacher addition."}]},{"id":"sen-skill","heading":"SEN — Skills","paragraphs":[]}]'::jsonb,
    'section_meta', '{}'::jsonb, 'section_guidance', '{}'::jsonb,
    'sen_daily_report_id', v_sen, 'report_type', 'daily',
    'toddler_daily_log_id', null, 'title', 'Combined daily and SEN', 'body', null
  );

  -- Negative cases must leave both reports and their history untouched.
  begin
    perform public.consolidate_sen_daily_drafts(v_canonical, v_duplicate, v_teacher, v_school, v_revision, v_revision - interval '1 second', v_patch);
    raise exception 'Expected stale revision rejection';
  exception when serialization_failure then null;
  end;
  begin
    perform public.consolidate_sen_daily_drafts(v_canonical, v_duplicate, v_other_teacher, v_school, v_revision, v_revision, v_patch);
    raise exception 'Expected author/assignment rejection';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.consolidate_sen_daily_drafts(v_canonical, v_duplicate, v_teacher, gen_random_uuid(), v_revision, v_revision, v_patch);
    raise exception 'Expected school rejection';
  exception when insufficient_privilege then null;
  end;
  update public.reports set status = 'sent' where id = v_duplicate;
  begin
    perform public.consolidate_sen_daily_drafts(v_canonical, v_duplicate, v_teacher, v_school, v_revision, v_revision, v_patch);
    raise exception 'Expected immutable report rejection';
  exception when serialization_failure then null;
  end;
  update public.reports set status = 'changes_requested', report_date = v_day + 1 where id = v_duplicate;
  begin
    perform public.consolidate_sen_daily_drafts(v_canonical, v_duplicate, v_teacher, v_school, v_revision, v_revision, v_patch);
    raise exception 'Expected report date mismatch rejection';
  exception when invalid_parameter_value then null;
  end;
  update public.reports set report_date = v_day where id = v_duplicate;
  insert into public.guardians (id, school_id, first_name, last_name) values (v_guardian, v_school, 'Synthetic', 'Guardian');
  insert into public.report_recipients (report_id, guardian_id, delivery_status) values (v_duplicate, v_guardian, 'pending');
  begin
    perform public.consolidate_sen_daily_drafts(v_canonical, v_duplicate, v_teacher, v_school, v_revision, v_revision, v_patch);
    raise exception 'Expected existing delivery rejection';
  exception when serialization_failure then null;
  end;
  delete from public.report_recipients where report_id = v_duplicate;
  assert (select title = 'Original SEN' from public.reports where id = v_canonical), 'Rejected calls changed canonical draft';
  assert (select report_id = v_duplicate from public.report_review_actions where id = v_action), 'Rejected calls moved history';

  -- Force a rollback AFTER the complete merge to prove all related writes undo
  -- together, including deletion and the real review-history foreign key.
  begin
    perform public.consolidate_sen_daily_drafts(v_canonical, v_duplicate, v_teacher, v_school, v_revision, v_revision, v_patch);
    assert not exists (select 1 from public.reports where id = v_duplicate), 'Merge did not delete duplicate';
    raise exception using errcode = 'P0002', message = 'Synthetic rollback probe';
  exception when no_data_found then null;
  end;
  assert exists (select 1 from public.reports where id = v_duplicate), 'Rollback lost duplicate';
  assert (select title = 'Original SEN' from public.reports where id = v_canonical), 'Rollback retained canonical patch';
  assert (select report_id = v_duplicate from public.report_review_actions where id = v_action), 'Rollback lost review history';
  assert (select report_id = v_duplicate from public.report_chat_messages where id = v_message), 'Rollback lost chat';
  assert (select report_id = v_duplicate from public.report_chat_artifacts where id = v_artifact), 'Rollback lost artifact';

  -- A real school admin can consolidate drafts owned by the assigned teacher.
  v_result := public.consolidate_sen_daily_drafts(v_canonical, v_duplicate, v_admin, v_school, v_revision, v_revision, v_patch);
  assert v_result = v_canonical, 'Wrong canonical report returned';
  assert not exists (select 1 from public.reports where id = v_duplicate), 'Duplicate remains';
  assert (select report_type = 'daily' and sections = v_patch -> 'sections' and body is null and updated_at > v_revision
          from public.reports where id = v_canonical), 'Combined report content or revision missing';
  assert (select report_id = v_canonical and notes = 'Preserve review history' from public.report_review_actions where id = v_action), 'Review history not preserved';
  assert (select report_id = v_canonical from public.report_chat_messages where id = v_message), 'Chat not preserved';
  assert (select report_id = v_canonical from public.report_chat_artifacts where id = v_artifact), 'Artifact not preserved';
  assert (select report_id = v_canonical from public.report_reviewers where id = v_reviewer), 'Distinct reviewer not preserved';
  assert (select count(*) = 2 from public.report_reviewers where report_id = v_canonical), 'Reviewer collision not resolved';
  assert exists (select 1 from public.report_review_actions where report_id = v_canonical and notes like '%Duplicate reviewer note%'), 'Colliding reviewer history not archived';
  assert (select count(*) = 3 from public.report_review_actions where report_id = v_canonical), 'Unexpected history count';

  -- Replaying stale inputs fails without appending sections or history again.
  begin
    perform public.consolidate_sen_daily_drafts(v_canonical, v_duplicate, v_admin, v_school, v_revision, v_revision, v_patch);
    raise exception 'Expected replay rejection';
  exception when serialization_failure then null;
  end;
  assert (select count(*) = 3 from public.report_review_actions where report_id = v_canonical), 'Replay duplicated history';
end;
$$;

rollback;
select 'SEN/daily consolidation assertions passed; all synthetic fixtures rolled back' as result;
