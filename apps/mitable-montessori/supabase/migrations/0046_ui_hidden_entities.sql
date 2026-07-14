-- Soft-hide classrooms and teachers from default UI without archiving.
-- Admins can reveal via a per-browser toggle; teachers always see filtered lists.

alter table public.classrooms
  add column if not exists ui_hidden boolean not null default false;

alter table public.users
  add column if not exists ui_hidden boolean not null default false;

comment on column public.classrooms.ui_hidden is
  'When true, classroom and its kids are omitted from default UI unless admin reveals.';

comment on column public.users.ui_hidden is
  'When true, teacher is omitted from default UI unless admin reveals.';
