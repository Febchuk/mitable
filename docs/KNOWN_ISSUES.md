# Known Issues

## `drizzle-kit push` fails with "Error please install required packages: 'drizzle-orm'"

**Status**: Unresolved workaround needed
**Affects**: `npm run db:push`, `npm run db:generate`, any `drizzle-kit` command from `apps/backend`

### Problem

In the npm workspaces monorepo, `drizzle-kit` and `drizzle-orm` are installed in different `node_modules` directories:

- `drizzle-kit` → hoisted to `<root>/node_modules/drizzle-kit`
- `drizzle-orm` → installed in `apps/backend/node_modules/drizzle-orm`

When `drizzle-kit` runs, it tries to `require('drizzle-orm')` from its own location (`<root>/node_modules/`), but `drizzle-orm` isn't there — it's in the workspace's local `node_modules`. This causes the "please install required packages" error.

### Why it happens

npm workspaces hoists dependencies to the root when possible, but some packages (like `drizzle-orm`) may stay in the workspace's local `node_modules` due to version conflicts or peer dependency resolution. `drizzle-kit` doesn't use Node's standard module resolution that would traverse up from the workspace directory — it resolves relative to its own installation location.

### Workarounds tried (none worked)

1. **`NODE_PATH=../../node_modules`** — drizzle-kit ignores `NODE_PATH`
2. **`npx drizzle-kit push` from `apps/backend/`** — same error, npx finds root-hoisted drizzle-kit
3. **Reinstalling with `npm install`** — doesn't change hoisting behavior

### Potential fixes to try

1. **Symlink drizzle-orm to root**: `ln -s apps/backend/node_modules/drizzle-orm node_modules/drizzle-orm`
2. **Force hoist drizzle-orm**: Add to root `package.json`:
   ```json
   "overrides": {
     "drizzle-orm": "$drizzle-orm"
   }
   ```
3. **Pin drizzle-kit locally**: Add `drizzle-kit` as a devDependency in `apps/backend/package.json` so both packages are in the same `node_modules`
4. **Use `.npmrc`**: Add `hoist-pattern[]=drizzle-orm` or switch to `public-hoist-pattern`
5. **Switch to pnpm**: pnpm's stricter node_modules structure avoids this class of issue

### Current workaround

Use `psql` directly for schema operations:

```bash
# Connect to Supabase
psql "postgresql://postgres.jfwtzxbqkrcscotpooke:PASSWORD@db.jfwtzxbqkrcscotpooke.supabase.co:5432/postgres"

# Or use Supabase Dashboard → SQL Editor
```
