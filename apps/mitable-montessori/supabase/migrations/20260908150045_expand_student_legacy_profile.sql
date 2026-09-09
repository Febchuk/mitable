-- Legacy-school roster compatibility.
--
-- A child owns their biographical, medical, household, and enrolment-status
-- facts. Contact information remains on `guardians`, so a parent can be linked
-- to more than one child without copying or drifting contact data. `class` is
-- already represented by `student_classroom_enrollments`, and age-by-September
-- is calculated from `birth_date` rather than stored as a value that goes stale.

alter table public.students
  add column if not exists middle_name text,
  add column if not exists state text,
  add column if not exists country text,
  add column if not exists school_attended text,
  add column if not exists health_info text,
  add column if not exists religion text,
  add column if not exists parent_marital_status text,
  add column if not exists hospital text,
  add column if not exists place_of_worship text,
  add column if not exists house text,
  add column if not exists academic_term text,
  add column if not exists academic_year text,
  add column if not exists term_status_changed text,
  add column if not exists student_status text,
  add column if not exists year_status_changed text;

alter table public.guardians
  add column if not exists contact_address text,
  add column if not exists alternative_phone text;

comment on column public.students.middle_name is 'Student middle name as supplied by the school.';
comment on column public.students.school_attended is 'Previous school attended, when supplied.';
comment on column public.students.health_info is 'Sensitive health information imported from the school roster.';
comment on column public.students.parent_marital_status is 'Household-level parent or guardian marital status, when supplied.';
comment on column public.students.academic_term is 'Legacy source term label at the time this record was imported.';
comment on column public.students.academic_year is 'Legacy source academic-year label at the time this record was imported.';
comment on column public.students.term_status_changed is 'Legacy source value for when term status changed.';
comment on column public.students.year_status_changed is 'Legacy source value for when year status changed.';
comment on column public.guardians.contact_address is 'Guardian contact address.';
comment on column public.guardians.alternative_phone is 'Guardian secondary telephone number.';
