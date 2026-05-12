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

Use the [Supabase CLI](https://supabase.com/docs/guides/cli) from **`apps/mitable-montessori`** (this folder now has `supabase/config.toml` from `supabase init`).

1. **Log in once:** `supabase login`
2. **Link this repo to your Supabase project** (project ref is the subdomain in `https://<project-ref>.supabase.co`):
   ```bash
   npm run supabase:link --workspace=@mitable/mitable-montessori
   ```
3. **Push every migration that is not yet recorded on the remote** (safe day-to-day command):
   ```bash
   npm run supabase:db:push --workspace=@mitable/mitable-montessori
   ```
   Preview only: `npm run supabase:db:push:dry --workspace=@mitable/mitable-montessori`  
   See local vs remote: `npm run supabase:migration:list --workspace=@mitable/mitable-montessori`

**If `db push` fails with “Found local migration files to be inserted before the last migration on remote”** (common after Studio pastes, `migration repair`, or two files sharing the same numeric prefix): apply the backlog explicitly:

```bash
npm run supabase:db:push:all --workspace=@mitable/mitable-montessori
```

That runs `supabase db push --include-all`. Preview with `supabase:db:push:all:dry`. Migrations here use idempotent DDL (`if not exists`, etc.) where possible so re-running is usually safe; if a statement errors because the object already exists, fix that migration or mark it applied via `migration repair --status applied <version>`.

**If `db push` fails with duplicate key on `schema_migrations_pkey`:** Supabase stores one row per **numeric prefix** (`0027`, `0036`, …). Two files like `0027_foo.sql` and `0027_bar.sql` are invalid — rename one to the next free number (see `0036_report_recipients_message_body.sql`).

**If `db push` fails with “duplicate … already exists”** (you ran SQL in Studio earlier): mark those migration versions as already applied on the remote, then push again — [`supabase migration repair --status applied`](https://supabase.com/docs/reference/cli/supabase-migration-repair).

**If `db push` fails with “Remote migration versions not found in local migrations directory”** (the linked project lists version numbers that have no matching `supabase/migrations/NNNN_*.sql` file in git — e.g. an old branch renamed or deleted migrations): from `apps/mitable-montessori`, remove those orphan rows from the remote history, then push. The CLI prints the exact versions; a common case is missing `0028` / `0030` while this repo goes `0027_*` → `0029_*` and `0029_*` → `0031_*`:

```bash
cd apps/mitable-montessori
supabase migration repair --status reverted 0028 0030
npm run supabase:db:push
```

`reverted` here only fixes the **tracking table** on Supabase (`supabase_migrations.schema_migrations`); it does not roll back DDL. Use this when those version numbers are mistakes or obsolete. If `0028` / `0030` were real one-off SQL you still need in the database, recover that SQL from backup or history before repairing.

**Fallback:** you can still paste `supabase/migrations/*.sql` files into the Studio SQL editor in numeric order; the CLI is just repeatable and records what ran.

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
