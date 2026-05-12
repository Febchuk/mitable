-- =============================================================================
-- 0037 — Per-report reviewer assignment
--
-- Until now, "reviewers" was an aspirational concept in the UI but had no
-- DB representation: `reports.approved_by_user_id` records the single final
-- approver and `report_review_actions` logs every action chronologically, but
-- there's nothing that says "Mei and Diego are assigned to review this draft."
--
-- This migration adds `report_reviewers`, the missing join table. Each row =
-- (report_id, reviewer_user_id, assigned_by_user_id, assigned_at, status).
-- `status` tracks whether the reviewer has acted yet — independent from the
-- chronological action log.
--
-- Reads use the same school-scoping pattern as 0018 (via public.reports
-- school_student_ids). Writes are restricted to authenticated school users.
-- =============================================================================

create table if not exists report_reviewers (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  reviewer_user_id uuid not null references public.users(id) on delete cascade,
  assigned_by_user_id uuid not null references public.users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'changes_requested')),
  /** When a reviewer acts. Lets the UI distinguish "ticked just now" from
   *  "ticked a day ago" without a join into report_review_actions. */
  acted_at timestamptz,
  /** Optional inline comment captured alongside the action. The full
   *  chronological history still lives in report_review_actions. */
  note text,
  /** One row per (report, reviewer). Re-assigning the same person is a
   *  no-op rather than a duplicate row. */
  unique (report_id, reviewer_user_id)
);

create index if not exists report_reviewers_report_id_idx
  on report_reviewers (report_id);
create index if not exists report_reviewers_reviewer_user_id_idx
  on report_reviewers (reviewer_user_id);
create index if not exists report_reviewers_status_idx
  on report_reviewers (status);

alter table report_reviewers enable row level security;

-- Read: anyone with read access to the parent report can see who's
-- assigned. Mirrors `scoped read review_actions` in 0018.
create policy "scoped read reviewers" on report_reviewers
  for select using (
    report_id in (
      select r.id from public.reports r
      where r.student_id in (select public.school_student_ids())
    )
  );

-- Write: any teacher/admin in the same school can assign reviewers (the
-- /submit endpoint is the primary writer; admin endpoints will write here
-- too). RLS matches the reports-write pattern from later 0002 policies.
create policy "scoped write reviewers" on report_reviewers
  for insert with check (
    report_id in (
      select r.id from public.reports r
      where r.student_id in (select public.school_student_ids())
    )
  );

create policy "scoped update reviewers" on report_reviewers
  for update using (
    report_id in (
      select r.id from public.reports r
      where r.student_id in (select public.school_student_ids())
    )
  );

create policy "scoped delete reviewers" on report_reviewers
  for delete using (
    report_id in (
      select r.id from public.reports r
      where r.student_id in (select public.school_student_ids())
    )
  );
