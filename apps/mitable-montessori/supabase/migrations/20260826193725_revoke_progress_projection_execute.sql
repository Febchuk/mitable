-- Supabase grants routine access to API roles separately from PUBLIC. This
-- trigger function has no legitimate direct caller, so revoke each route.
revoke execute on function public.apply_command_projection() from anon, authenticated;
