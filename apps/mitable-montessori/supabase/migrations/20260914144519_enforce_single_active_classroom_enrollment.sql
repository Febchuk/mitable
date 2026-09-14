-- A child can be actively enrolled in one classroom at a time. The old index
-- only restricted *primary* enrollments, which allowed additional active,
-- non-primary enrollment rows to be created.

-- Keep the primary enrollment when repairing existing data; otherwise keep the
-- most recently started enrollment. End the remaining active rows rather than
-- deleting history.
with ranked_active_enrollments as (
  select
    id,
    row_number() over (
      partition by student_id
      order by is_primary desc, start_date desc, created_at desc, id desc
    ) as row_number
  from public.student_classroom_enrollments
  where end_date is null
)
update public.student_classroom_enrollments as enrollment
set end_date = greatest(enrollment.start_date, current_date)
from ranked_active_enrollments as ranked
where enrollment.id = ranked.id
  and ranked.row_number > 1;

-- Active enrollments are now singular, so retain the existing primary flag's
-- meaning for older consumers until that legacy field can be retired.
update public.student_classroom_enrollments
set is_primary = true
where end_date is null
  and is_primary = false;

drop index if exists public.student_active_primary_enrollment_unique;

create unique index student_active_classroom_enrollment_unique
  on public.student_classroom_enrollments (student_id)
  where end_date is null;
