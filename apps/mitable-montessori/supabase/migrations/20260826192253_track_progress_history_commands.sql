-- Preserve the exact command that produced each history row. This lets a
-- family moment be rendered with its corresponding curriculum progress, while
-- retaining the existing append-only history model.
alter table public.student_progress_history
  add column if not exists source_command_id uuid
  references public.commands(id) on delete set null;

create unique index if not exists student_progress_history_source_command_idx
  on public.student_progress_history (source_command_id)
  where source_command_id is not null;

-- This is the current projection function from 0041, retaining the later
-- attendance arrival-time addition from 0022. The one intentional change to
-- the progress branch is persisting new.id on the history row.
create or replace function public.apply_command_projection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id   uuid;
  v_subtopic_id  uuid;
  v_status       text;
  v_comment      text;
  v_date         date;
  v_arrival_time time;
  v_progress_id  uuid;
  v_prev_status  text;
begin
  if new.command_type = 'attendance' then
    v_student_id   := (new.payload ->> 'student_id')::uuid;
    v_status       := new.payload ->> 'status';
    v_date         := coalesce((new.payload ->> 'date')::date, current_date);
    v_comment      := new.payload ->> 'comment';
    v_arrival_time := nullif(new.payload ->> 'arrival_time', '')::time;

    insert into attendance_records (
      student_id, classroom_id, attendance_date, status,
      comment, arrival_time, marked_by_user_id, source_command_id
    )
    values (v_student_id, new.classroom_id, v_date, v_status,
            v_comment, v_arrival_time, new.user_id, new.id)
    on conflict (student_id, attendance_date)
    do update set
      status            = excluded.status,
      comment           = excluded.comment,
      arrival_time      = excluded.arrival_time,
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
      previous_status, new_status, comment, changed_by_user_id, source_command_id
    )
    values (v_progress_id, v_student_id, v_subtopic_id,
            v_prev_status, v_status, v_comment, new.user_id, new.id);

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

  return new;
end;
$$;
