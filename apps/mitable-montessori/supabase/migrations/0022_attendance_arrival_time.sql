-- Adds an optional `arrival_time` column to attendance_records so the
-- attendance register can record the time a present child arrived.
--
-- Stored as `time` (no date component) — combined with `attendance_date`
-- when surfaced in the UI. Existing rows get NULL.
--
-- The `apply_command_projection` trigger (see 0003_triggers) is updated
-- to read `arrival_time` from the attendance command payload and to upsert
-- it into attendance_records alongside status / comment.

alter table attendance_records
  add column if not exists arrival_time time;

create or replace function apply_command_projection()
returns trigger as $$
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
      previous_status, new_status, comment, changed_by_user_id
    )
    values (v_progress_id, v_student_id, v_subtopic_id,
            v_prev_status, v_status, v_comment, new.user_id);

  end if;
  -- 'note' commands write nothing to projections; they live in the commands log only.
  return new;
end;
$$ language plpgsql security definer;
