-- Makes an external student move one database operation, so it cannot leave a
-- child without an active enrollment if one of the two writes fails.
create or replace function public.transfer_student_classroom(
  p_school_id uuid,
  p_student_id uuid,
  p_new_classroom_id uuid,
  p_start_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment_id uuid;
begin
  if not exists (
    select 1 from public.students
    where id = p_student_id and school_id = p_school_id and archived_at is null
  ) then
    raise exception 'Student not found';
  end if;

  if not exists (
    select 1 from public.classrooms
    where id = p_new_classroom_id and school_id = p_school_id and status = 'active'
  ) then
    raise exception 'Classroom not found';
  end if;

  if exists (
    select 1 from public.student_classroom_enrollments
    where student_id = p_student_id and classroom_id = p_new_classroom_id and end_date is null
  ) then
    raise exception 'Student is already actively enrolled in this classroom';
  end if;

  update public.student_classroom_enrollments
  set end_date = p_start_date
  where student_id = p_student_id and end_date is null;

  insert into public.student_classroom_enrollments (student_id, classroom_id, start_date, is_primary)
  values (p_student_id, p_new_classroom_id, p_start_date, true)
  returning id into v_enrollment_id;

  return v_enrollment_id;
end;
$$;

revoke all on function public.transfer_student_classroom(uuid, uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.transfer_student_classroom(uuid, uuid, uuid, date) to service_role;
