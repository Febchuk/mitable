# Supabase setup

## 1. Create a new Supabase project

This app needs a **separate** Supabase project from the existing mitable backend — different schema, different RLS, different domain. Save the URL, anon key, and service role key.

## 2. Add credentials to `apps/mitable-montessori/.env.local`

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...
NEXT_PUBLIC_APP_NAME=mitable-montessori
```

## 3. Apply migrations

In the Supabase Studio SQL editor, paste and run each migration in order:

1. `migrations/0001_init.sql` — 18 tables (17 from the spec + `school_crypto_salts`)
2. `migrations/0002_rls.sql` — RLS policies (school-scoped reads, teacher command insert, immutability, admin writes, guardian reads)
3. `migrations/0003_triggers.sql` — `commands` AFTER INSERT trigger that updates `attendance_records`, `student_progress`, `student_progress_history`
4. `migrations/0004_jwt_claims.sql` — `custom_access_token_hook` PL/pgSQL function

## 4. Register the JWT hook

In Supabase Studio: **Authentication → Hooks → Custom Access Token Hook**, select `public.custom_access_token_hook`. This adds `school_id` and `role` to every issued JWT.

## 5. Seed the database

```bash
npm run supabase:seed --workspace=@mitable/mitable-montessori
```

This creates:

- 1 school (Mitable Demo Montessori)
- 1 admin (`admin@example.school`) and 1 teacher (`teacher@example.school`), shared password `montessori-demo-1!`
- 1 classroom (Cypress Room) with the teacher assigned as lead
- 1 default Montessori curriculum (5 topics, 30 subtopics)
- 10 students with active primary enrollments
- 1–2 guardians per student linked via `student_guardians`
