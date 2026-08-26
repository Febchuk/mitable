-- Track completion of the short, parent-specific welcome flow.
alter table guardians
  add column if not exists onboarding_completed_at timestamptz;
