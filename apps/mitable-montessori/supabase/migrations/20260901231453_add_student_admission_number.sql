alter table public.students
  add column if not exists admission_number text;

comment on column public.students.admission_number is
  'School-issued admission or enrollment identifier for the student.';
