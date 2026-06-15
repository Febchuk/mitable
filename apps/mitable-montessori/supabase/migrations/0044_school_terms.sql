-- School terms — admin-managed date ranges for end-of-term reports.

create table school_terms (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint school_terms_dates_check check (end_date >= start_date)
);

create unique index school_terms_school_lower_name_idx
  on school_terms (school_id, lower(name));

create index school_terms_school_dates_idx
  on school_terms (school_id, start_date desc);

create or replace function tg_school_terms_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger school_terms_set_updated_at
  before update on school_terms
  for each row execute function tg_school_terms_set_updated_at();

alter table school_terms enable row level security;

create policy "school_terms read"
  on public.school_terms for select
  using (school_id = public.current_user_school_id());

create policy "school_terms admin write"
  on public.school_terms for all
  using (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  )
  with check (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  );
