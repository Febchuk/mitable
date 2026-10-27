-- Server-only delivery history. The API verifies school and classroom access
-- before using its service-role client; no browser role may read addresses/payloads.
create table public.attendance_parent_deliveries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  classroom_id uuid not null references public.classrooms(id),
  student_id uuid not null references public.students(id),
  attendance_date date not null,
  recipient_email text not null,
  snapshot_hash text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_id text,
  last_error text,
  created_at timestamptz not null default now(),
  unique (school_id, classroom_id, student_id, attendance_date, recipient_email, snapshot_hash)
);
create index attendance_parent_deliveries_school_day_idx on public.attendance_parent_deliveries(school_id, attendance_date);
create index attendance_parent_deliveries_classroom_idx on public.attendance_parent_deliveries(classroom_id);
create index attendance_parent_deliveries_student_idx on public.attendance_parent_deliveries(student_id);
alter table public.attendance_parent_deliveries enable row level security;
revoke all on public.attendance_parent_deliveries from public, anon, authenticated;
grant select, insert, update on public.attendance_parent_deliveries to service_role;
