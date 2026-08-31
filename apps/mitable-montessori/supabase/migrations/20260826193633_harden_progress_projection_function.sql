-- Projection happens only through the commands trigger. It is not an RPC
-- endpoint and must not be callable directly by public roles.
revoke execute on function public.apply_command_projection() from public;
