-- A captured moment belongs to the exact approved progress command that
-- prompted it. It stays nullable so the first release's existing standalone
-- media records remain valid, and so deleting an audit command never deletes
-- a school-owned photo or video.
alter table public.student_media
  add column if not exists progress_command_id uuid
  references public.commands(id) on delete set null;

create index if not exists student_media_progress_command_idx
  on public.student_media (progress_command_id)
  where progress_command_id is not null and status <> 'deleted';
