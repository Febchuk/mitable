-- =============================================================================
-- 0023 — Report-editing chat thread storage
--
-- Persists the conversation between a teacher (or admin) and the editing
-- assistant for a given report. One thread per report; per-paragraph scope is
-- carried on each message via `target_ref` rather than a separate thread.
--
-- The agent reasons in tokenized text (same privacy contract as the draft
-- agent), but `payload` is stored detokenized so thread reload doesn't have
-- to re-resolve the reference set. The `references` snapshot used for that
-- turn lives alongside it for future re-detokenization if a name changes.
-- =============================================================================

create table if not exists report_chat_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- `kind` covers every archetype the wire format supports across phases.
  -- Phase 2 only emits `prose`, `clarify`, and `user-text`; later phases add
  -- the structured archetypes without needing a schema migration.
  kind text not null check (kind in (
    'prose', 'proposal', 'chips', 'obs-ref', 'ghost-edit', 'clarify', 'user-text'
  )),
  payload jsonb not null,                       -- detokenized, client-ready
  "references" jsonb,                            -- ReportReferenceSet snapshot used this turn
  target_ref jsonb,                              -- { sectionId?, paragraphId?, quote? }
  applied_at timestamptz,                        -- set when teacher accepts a proposal/ghost
  applied_to jsonb,                              -- before/after snapshot for audit
  dismissed_at timestamptz,                      -- proposal/ghost explicitly rejected
  tool_trace jsonb,                              -- tokenized agent-side trace + token usage
  actor_role text not null check (actor_role in ('teacher', 'admin', 'assistant')),
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists report_chat_messages_report_idx
  on report_chat_messages (report_id, created_at);

-- ----- RLS ----------------------------------------------------------------
-- Mirrors the read-side pattern used by report_review_actions (0018): scope
-- via the existing `public.school_student_ids()` helper to avoid recursion
-- through the reports/students policies. Admins and teachers both read+write
-- within their school; route-level checks in `requireReportAccess` handle
-- the teacher-vs-admin distinction for non-RLS rules (e.g. classroom
-- assignment).
alter table report_chat_messages enable row level security;

drop policy if exists "scoped read report_chat_messages" on report_chat_messages;
create policy "scoped read report_chat_messages" on report_chat_messages
  for select using (
    report_id in (
      select r.id from public.reports r
      where r.student_id in (select public.school_student_ids())
    )
  );

drop policy if exists "scoped write report_chat_messages" on report_chat_messages;
create policy "scoped write report_chat_messages" on report_chat_messages
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
