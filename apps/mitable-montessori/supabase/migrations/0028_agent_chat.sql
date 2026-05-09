-- =============================================================================
-- 0028 — General-purpose chat-agent threads
--
-- Persists the multi-turn dialogue between a teacher and the conversational
-- agent (`POST /api/agent/chat`). Distinct from `report_chat_messages` —
-- those are scoped to a single report; these threads are roster-wide and
-- ephemeral (a teacher might keep several "What did the morning circle look
-- like?"–style threads open at once).
--
-- Privacy contract: `body_tokenized` stores prose with `{{student:UUID}}`
-- tokens (NEVER names). The display strings live only in the per-message
-- `token_map_snapshot`, which the route uses to re-detokenize on reload —
-- so a row written today still renders correctly if a student is renamed
-- tomorrow. Logs and DB exports always show tokens, never names.
-- =============================================================================

create table if not exists agent_chat_threads (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  classroom_id uuid references classrooms(id) on delete set null,
  created_by_user_id uuid not null references users(id) on delete cascade,
  -- Optional title the UI may show. Stored tokenized.
  title_tokenized text,
  created_at timestamptz not null default now()
);

create index if not exists agent_chat_threads_school_idx
  on agent_chat_threads (school_id, created_at desc);
create index if not exists agent_chat_threads_user_idx
  on agent_chat_threads (created_by_user_id, created_at desc);

create table if not exists agent_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references agent_chat_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- Tokenized prose. Names NEVER appear here.
  body_tokenized text not null,
  -- Snapshot of TokenRef[] used to redact this message. Lets us
  -- re-detokenize on reload without re-resolving the live roster.
  token_map_snapshot jsonb not null default '[]'::jsonb,
  -- Optional structured trace for debugging (latency, model, tool counts).
  -- Never contains detokenized prose.
  tool_trace jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_chat_messages_thread_idx
  on agent_chat_messages (thread_id, created_at);

-- ----- RLS ----------------------------------------------------------------
-- Read/write scoped to the user who created the thread, plus admins in the
-- same school. The route layer additionally requires the user be in the
-- thread's school via `requireUser()`, so this policy is defense-in-depth.

alter table agent_chat_threads enable row level security;
alter table agent_chat_messages enable row level security;

drop policy if exists "scoped read agent_chat_threads" on agent_chat_threads;
create policy "scoped read agent_chat_threads" on agent_chat_threads
  for select using (
    created_by_user_id = auth.uid()
    or school_id in (
      select u.school_id from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

drop policy if exists "scoped write agent_chat_threads" on agent_chat_threads;
create policy "scoped write agent_chat_threads" on agent_chat_threads
  for all
  to authenticated
  using (
    created_by_user_id = auth.uid()
    or school_id in (
      select u.school_id from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  )
  with check (
    created_by_user_id = auth.uid()
    or school_id in (
      select u.school_id from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

drop policy if exists "scoped read agent_chat_messages" on agent_chat_messages;
create policy "scoped read agent_chat_messages" on agent_chat_messages
  for select using (
    thread_id in (
      select t.id from public.agent_chat_threads t
      where t.created_by_user_id = auth.uid()
        or t.school_id in (
          select u.school_id from public.users u
          where u.id = auth.uid() and u.role = 'admin'
        )
    )
  );

drop policy if exists "scoped write agent_chat_messages" on agent_chat_messages;
create policy "scoped write agent_chat_messages" on agent_chat_messages
  for all
  to authenticated
  using (
    thread_id in (
      select t.id from public.agent_chat_threads t
      where t.created_by_user_id = auth.uid()
        or t.school_id in (
          select u.school_id from public.users u
          where u.id = auth.uid() and u.role = 'admin'
        )
    )
  )
  with check (
    thread_id in (
      select t.id from public.agent_chat_threads t
      where t.created_by_user_id = auth.uid()
        or t.school_id in (
          select u.school_id from public.users u
          where u.id = auth.uid() and u.role = 'admin'
        )
    )
  );
