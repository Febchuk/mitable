-- School-scoped credentials for the external Montessori API. The credential
-- secret is never stored: only a SHA-256 verifier is persisted.
create table external_api_keys (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references schools(id) on delete cascade,
  name               text not null check (char_length(trim(name)) between 1 and 80),
  key_hash           text not null unique,
  key_prefix         text not null,
  scopes             text[] not null default array['read', 'write']::text[]
                     check (scopes <@ array['read', 'write']::text[] and cardinality(scopes) > 0),
  created_by_user_id uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz,
  revoked_at         timestamptz,
  last_used_at       timestamptz,
  check (expires_at is null or expires_at > created_at)
);

create index external_api_keys_school_active_idx
  on external_api_keys (school_id, created_at desc)
  where revoked_at is null;

alter table external_api_keys enable row level security;

-- External API keys are checked only by server-side code using the service
-- role. Never expose the verifier table through Supabase's Data API.
revoke all on table external_api_keys from anon, authenticated;
