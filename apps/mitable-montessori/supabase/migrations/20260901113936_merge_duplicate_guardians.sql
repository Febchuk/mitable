-- A parent is one guardian identity within a school, even when they have
-- multiple children. Older admin flows inserted a new guardian row each time
-- the same email was attached to another student. Consolidate those rows and
-- enforce the identity rule going forward.

create temporary table guardian_merge_map on commit drop as
select
  id as old_id,
  first_value(id) over (
    partition by school_id, lower(btrim(email))
    order by (auth_user_id is not null) desc, created_at asc, id asc
  ) as canonical_id
from public.guardians
where nullif(btrim(email), '') is not null;

-- If duplicate guardian rows were both attached to the same child, preserve
-- one link and combine the two permission flags before repointing the rest.
create temporary table student_guardian_merge on commit drop as
select
  m.canonical_id,
  sg.student_id,
  (array_agg(
    sg.id
    order by (sg.guardian_id = m.canonical_id) desc, sg.created_at asc, sg.id asc
  ))[1] as keep_id,
  bool_or(sg.is_primary_contact) as is_primary_contact,
  bool_or(sg.receives_reports) as receives_reports
from public.student_guardians sg
join guardian_merge_map m on m.old_id = sg.guardian_id
group by m.canonical_id, sg.student_id;

update public.student_guardians sg
set
  guardian_id = merged.canonical_id,
  is_primary_contact = merged.is_primary_contact,
  receives_reports = merged.receives_reports
from student_guardian_merge merged
where sg.id = merged.keep_id;

delete from public.student_guardians sg
using guardian_merge_map m, student_guardian_merge merged
where sg.guardian_id = m.old_id
  and m.canonical_id = merged.canonical_id
  and sg.student_id = merged.student_id
  and sg.id <> merged.keep_id;

update public.student_guardians sg
set guardian_id = m.canonical_id
from guardian_merge_map m
where sg.guardian_id = m.old_id
  and m.old_id <> m.canonical_id;

update public.report_recipients recipient
set guardian_id = m.canonical_id
from guardian_merge_map m
where recipient.guardian_id = m.old_id
  and m.old_id <> m.canonical_id;

update public.guardian_invitations invitation
set guardian_id = m.canonical_id
from guardian_merge_map m
where invitation.guardian_id = m.old_id
  and m.old_id <> m.canonical_id;

delete from public.guardians guardian
using guardian_merge_map m
where guardian.id = m.old_id
  and m.old_id <> m.canonical_id;

create unique index if not exists guardians_school_normalized_email_unique
  on public.guardians (school_id, lower(btrim(email)))
  where nullif(btrim(email), '') is not null;

create unique index if not exists student_guardians_student_guardian_unique
  on public.student_guardians (student_id, guardian_id);
