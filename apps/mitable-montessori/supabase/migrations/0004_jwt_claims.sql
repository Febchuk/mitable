-- Custom Access Token Hook — adds `school_id` and `role` to the JWT.
-- Register this hook via Supabase Studio: Authentication → Hooks → Custom Access Token.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id   uuid;
  v_school_id uuid;
  v_role      text;
  claims      jsonb;
begin
  v_user_id := (event ->> 'user_id')::uuid;
  claims    := event -> 'claims';

  select school_id, role
    into v_school_id, v_role
    from public.users
   where id = v_user_id;

  if v_school_id is not null then
    claims := jsonb_set(claims, '{school_id}', to_jsonb(v_school_id::text));
  end if;
  if v_role is not null then
    claims := jsonb_set(claims, '{role}', to_jsonb(v_role));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.users to supabase_auth_admin;

-- Allow Supabase Auth admin role to bypass RLS when reading users for the JWT hook.
create policy "auth admin reads users for jwt"
  on public.users
  for select
  to supabase_auth_admin
  using (true);
