-- =============================================================================
-- 0024 — Report-editing chat artifacts (photos / OCR / transcript stubs)
--
-- Stores the photos and OCR'd notes a teacher attaches to chat turns. The
-- agent's `search_capture_artifacts` read tool surfaces these so it can
-- propose pulling an observation into the report. Cascade-delete with the
-- report — artifacts have no value once their report is gone.
--
-- The actual photo bytes live in a Supabase storage bucket
-- (`report-chat-artifacts`); the row carries `storage_path` for retrieval.
-- =============================================================================

create table if not exists report_chat_artifacts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  kind text not null check (kind in ('photo', 'transcript', 'ocr')),
  storage_path text,                                -- nullable for transcript-only rows
  ocr_text text,                                    -- detokenized client-side OCR result
  capture_metadata jsonb,                           -- { capturedAt, mimeType, sizeBytes, area? }
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists report_chat_artifacts_report_idx
  on report_chat_artifacts (report_id, created_at);

-- Full-text search on ocr_text + capture_metadata->>'area' so the agent's
-- search_capture_artifacts tool can match free-form queries. Postgres' default
-- english config is good enough for what teachers type.
create index if not exists report_chat_artifacts_ocr_fts_idx
  on report_chat_artifacts using gin (to_tsvector('english', coalesce(ocr_text, '')));

-- ----- RLS ----------------------------------------------------------------
-- Mirrors report_chat_messages exactly: scope via school_student_ids() through
-- a join to reports. Admin/teacher distinction happens at the route layer.
alter table report_chat_artifacts enable row level security;

drop policy if exists "scoped read report_chat_artifacts" on report_chat_artifacts;
create policy "scoped read report_chat_artifacts" on report_chat_artifacts
  for select using (
    report_id in (
      select r.id from public.reports r
      where r.student_id in (select public.school_student_ids())
    )
  );

drop policy if exists "scoped write report_chat_artifacts" on report_chat_artifacts;
create policy "scoped write report_chat_artifacts" on report_chat_artifacts
  for all
  to authenticated
  using (
    report_id in (
      select r.id from public.reports r
      where r.student_id in (select public.school_student_ids())
    )
  )
  with check (
    report_id in (
      select r.id from public.reports r
      where r.student_id in (select public.school_student_ids())
    )
  );
