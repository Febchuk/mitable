-- =============================================================================
-- 0041 — Free-form child comments (Progress "New comment")
-- =============================================================================
--
-- Teachers can leave a note about a child that isn't tied to any curriculum
-- subtopic or status change. student_progress_history is keyed by
-- curriculum_subtopic_id NOT NULL, so it can't hold these; this gives them a
-- home and lets the Progress "Recent updates" rail show them alongside
-- introduced/practicing/mastered changes.
--
-- Writes follow the same command-sourced path as progress + attendance: the
-- client inserts a `commands` row (command_type = 'comment') and the
-- SECURITY DEFINER projection trigger writes this table. So we only need SELECT
-- policies here — the trigger does the insert with elevated rights.

create table public.student_comments (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.students(id) on delete cascade,
  classroom_id       uuid not null references public.classrooms(id) on delete cascade,
  comment            text not null,
  created_by_user_id uuid references public.users(id),
  source_command_id  uuid references public.commands(id),
  created_at         timestamptz not null default now()
);

create index student_comments_student_created_idx
  on public.student_comments (student_id, created_at desc);
create index student_comments_classroom_created_idx
  on public.student_comments (classroom_id, created_at desc);

-- RLS: read scoping mirrors student_progress_history (see 0014). Same
-- SECURITY DEFINER helpers keep the policy graph acyclic.
alter table public.student_comments enable row level security;

create policy "teacher read student_comments" on public.student_comments
  for select
  using (student_id in (select public.teacher_visible_student_ids()));

create policy "admin read student_comments" on public.student_comments
  for select
  using (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  );

create policy "guardian read student_comments" on public.student_comments
  for select
  using (student_id in (select public.guardian_visible_student_ids()));

-- Extend the command projection with a 'comment' branch. The 'attendance' and
-- 'progress' branches are unchanged from 0003_triggers.sql.
create or replace function apply_command_projection()
returns trigger as $$
declare
  v_student_id  uuid;
  v_subtopic_id uuid;
  v_status      text;
  v_comment     text;
  v_date        date;
  v_progress_id uuid;
  v_prev_status text;
begin
  if new.command_type = 'attendance' then
    v_student_id := (new.payload ->> 'student_id')::uuid;
    v_status     := new.payload ->> 'status';
    v_date       := coalesce((new.payload ->> 'date')::date, current_date);
    v_comment    := new.payload ->> 'comment';

    insert into attendance_records (
      student_id, classroom_id, attendance_date, status,
      comment, marked_by_user_id, source_command_id
    )
    values (v_student_id, new.classroom_id, v_date, v_status,
            v_comment, new.user_id, new.id)
    on conflict (student_id, attendance_date)
    do update set
      status            = excluded.status,
      comment           = excluded.comment,
      marked_by_user_id = excluded.marked_by_user_id,
      source_command_id = excluded.source_command_id,
      updated_at        = now();

  elsif new.command_type = 'progress' then
    v_student_id  := (new.payload ->> 'student_id')::uuid;
    v_subtopic_id := (new.payload ->> 'subtopic_id')::uuid;
    v_status      := new.payload ->> 'status';
    v_comment     := new.payload ->> 'comment';

    select id, status into v_progress_id, v_prev_status
    from student_progress
    where student_id = v_student_id
      and curriculum_subtopic_id = v_subtopic_id
      and classroom_id = new.classroom_id;

    if v_progress_id is null then
      insert into student_progress (
        student_id, classroom_id, curriculum_subtopic_id, status,
        comment, updated_by_user_id, source_command_id
      )
      values (v_student_id, new.classroom_id, v_subtopic_id, v_status,
              v_comment, new.user_id, new.id)
      returning id into v_progress_id;
    else
      update student_progress
      set status             = v_status,
          comment            = v_comment,
          updated_by_user_id = new.user_id,
          source_command_id  = new.id,
          updated_at         = now()
      where id = v_progress_id;
    end if;

    insert into student_progress_history (
      student_progress_id, student_id, curriculum_subtopic_id,
      previous_status, new_status, comment, changed_by_user_id
    )
    values (v_progress_id, v_student_id, v_subtopic_id,
            v_prev_status, v_status, v_comment, new.user_id);

  elsif new.command_type = 'comment' then
    v_student_id := (new.payload ->> 'student_id')::uuid;
    v_comment    := new.payload ->> 'comment';

    if v_student_id is not null and coalesce(btrim(v_comment), '') <> '' then
      insert into student_comments (
        student_id, classroom_id, comment, created_by_user_id, source_command_id
      )
      values (v_student_id, new.classroom_id, v_comment, new.user_id, new.id);
    end if;

  end if;
  -- 'note' commands write nothing to projections; they live in the commands log only.
  return new;
end;
$$ language plpgsql security definer;
