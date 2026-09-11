-- Staff members can also be guardians. Older guardian records were created
-- without connecting them to an existing school login, leaving their children
-- invisible in the parent portal even when the emails matched.
update public.guardians as guardian
set
  auth_user_id = staff.id,
  updated_at = now()
from public.users as staff
where guardian.auth_user_id is null
  and guardian.school_id = staff.school_id
  and nullif(btrim(guardian.email), '') is not null
  and lower(btrim(guardian.email)) = lower(btrim(staff.email))
  and not exists (
    select 1
    from public.guardians as claimed_guardian
    where claimed_guardian.auth_user_id = staff.id
      and claimed_guardian.id <> guardian.id
  );
