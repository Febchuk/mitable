-- School-owned photos and videos captured directly in the teacher app.
--
-- Objects live in a private bucket. The database row is the source of truth
-- for whether an item has actually been shared with a child's family.

create table if not exists student_media (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools(id),
  student_id          uuid not null references students(id),
  uploaded_by_user_id uuid not null references users(id),
  kind                text not null check (kind in ('photo', 'video')),
  mime_type           text not null check (mime_type in ('image/jpeg', 'image/webp', 'video/mp4', 'video/webm')),
  byte_size           bigint not null check (byte_size > 0 and byte_size <= 104857600),
  storage_path        text not null unique,
  caption             text not null default '' check (char_length(caption) <= 600),
  status              text not null default 'uploading' check (status in ('uploading', 'shared', 'deleted')),
  shared_at           timestamptz,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index if not exists student_media_student_created_idx
  on student_media (student_id, created_at desc)
  where status <> 'deleted';

create index if not exists student_media_school_created_idx
  on student_media (school_id, created_at desc)
  where status <> 'deleted';

alter table student_media enable row level security;

-- Normal writes go through server routes, where teacher/classroom permission
-- and the signed upload token are checked together. Service-role requests
-- bypass RLS; there is intentionally no browser insert/update/delete policy.
drop policy if exists "staff read school student media" on student_media;
create policy "staff read school student media"
  on student_media
  for select
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);

drop policy if exists "guardians read shared student media" on student_media;
create policy "guardians read shared student media"
  on student_media
  for select
  using (
    status = 'shared'
    and student_id in (select public.guardian_visible_student_ids())
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-media',
  'student-media',
  false,
  104857600,
  array['image/jpeg', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do nothing;
