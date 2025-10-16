# Supabase Setup Guide

Complete guide for setting up Supabase as the PostgreSQL database for Mitable AI.

## Table of Contents

- [Quick Start (5 minutes)](#quick-start-5-minutes)
- [Detailed Setup](#detailed-setup)
- [Local Development](#local-development)
- [Running Migrations](#running-migrations)
- [Production Configuration](#production-configuration)
- [Troubleshooting](#troubleshooting)

---

## Quick Start (5 minutes)

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign in with GitHub
3. Click "New Project"
4. Fill in:
   - **Name**: `mitable-production` (or `mitable-dev`)
   - **Database Password**: Generate strong password (save it!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free (for MVP)

5. Wait 2 minutes for project creation

### 2. Get Connection Strings

Once project is ready:

1. Go to **Project Settings** → **Database**
2. Scroll to **Connection String** section
3. Copy the **Connection pooling** string (recommended for production)

You'll see something like:

```
postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### 3. Configure Environment Variables

In `apps/backend/.env`:

```bash
# Supabase Database
DATABASE_URL="postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

# Optional: Direct connection (for migrations)
DATABASE_DIRECT_URL="postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres"

# Pinecone
PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX_NAME=mitable-embeddings

# OpenAI
OPENAI_API_KEY=your_openai_key

# Gemini
GEMINI_API_KEY=your_gemini_key

# JWT
JWT_SECRET=your_random_secret_here
```

### 4. Install Dependencies

```bash
cd apps/backend
npm install pg
```

### 5. Test Connection

Create `apps/backend/src/db/client.ts`:

```typescript
import pkg from "pg";
const { Pool } = pkg;
import { config } from "../config.js";

export const pool = new Pool({
  connectionString: config.database.url,
  ssl: {
    rejectUnauthorized: false, // Required for Supabase
  },
});

// Test connection
export async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW()");
    console.log("✅ Database connected:", result.rows[0]);
    client.release();
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
}
```

Run test:

```bash
node -e "require('./out/db/client.js').testConnection()"
```

✅ **You're ready!** Proceed to [Running Migrations](#running-migrations)

---

## Detailed Setup

### Create Multiple Environments

For production-grade setup:

1. **Development Database**
   - Name: `mitable-dev`
   - Use for local development

2. **Staging Database** (optional)
   - Name: `mitable-staging`
   - Use for testing before production

3. **Production Database**
   - Name: `mitable-production`
   - Use for live users

Store connection strings in separate `.env` files:

- `.env.development`
- `.env.staging`
- `.env.production`

### Connection Pooling vs Direct Connection

**Connection Pooling (Recommended for App)**

```
postgresql://postgres.xxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

- ✅ Use in your Express app
- ✅ Better performance under load
- ✅ Prevents connection exhaustion
- Port: `6543`

**Direct Connection (For Migrations)**

```
postgresql://postgres.xxx:[PASSWORD]@db.xxx.supabase.co:5432/postgres
```

- ✅ Use for running migrations
- ✅ Use for admin operations
- ⚠️ Limited connections (avoid in app)
- Port: `5432`

---

## Local Development

### Option 1: Use Remote Supabase Dev Project

Easiest option - just use your `mitable-dev` project on Supabase.

**Pros:**

- No local setup needed
- Accessible from any machine
- Same environment as production

**Cons:**

- Requires internet connection
- Slower than localhost

### Option 2: Local PostgreSQL with Docker

Run PostgreSQL locally, push to Supabase for production.

**docker-compose.yml:**

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:15-alpine
    container_name: mitable-postgres-dev
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: mitable
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

**Start local database:**

```bash
docker-compose up -d
```

**Local .env:**

```bash
DATABASE_URL="postgresql://postgres:dev_password@localhost:5432/mitable"
```

### Option 3: Supabase CLI (Local Supabase Stack)

Run entire Supabase stack locally (PostgreSQL + Auth + Storage + APIs).

**Install CLI:**

```bash
npm install -g supabase
```

**Initialize:**

```bash
cd apps/backend
supabase init
```

**Start local Supabase:**

```bash
supabase start
```

You'll get local URLs:

- API URL: `http://localhost:54321`
- Database URL: `postgresql://postgres:postgres@localhost:54322/postgres`
- Studio URL: `http://localhost:54323` (GUI for database)

**Stop:**

```bash
supabase stop
```

---

## Running Migrations

This project uses **Drizzle Kit** for schema management and migrations. Drizzle automatically generates SQL migrations from your TypeScript schema files.

### Drizzle Kit Migration Workflow

**Configuration** (already set up in `drizzle.config.ts`):

```typescript
export default defineConfig({
  schema: "./src/db/schema/index.ts",  // Your TypeScript schema
  out: "./src/db/migrations",           // Generated SQL migrations
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### Step-by-Step Migration Process

#### 1. Make Schema Changes

Edit your schema files in `apps/backend/src/db/schema/`:

```typescript
// Example: Add a new field to templates
export const roadmapTemplates = pgTable("roadmap_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  title: varchar("title", { length: 255 }).notNull(),
  // Add new field
  color: varchar("color", { length: 7 }), // New field for template color
  // ... rest of fields
});
```

#### 2. Generate Migration

```bash
cd apps/backend
npm run db:generate
```

This command:
- Compares your schema files with the current database state
- Generates SQL migration file in `src/db/migrations/`
- Creates migration metadata in `src/db/migrations/meta/`

**Output:**
```
[✓] Your SQL migration file ➜ src/db/migrations/0001_add_template_color.sql
```

#### 3. Review Generated SQL

Always review the generated SQL before applying:

```bash
cat src/db/migrations/0001_add_template_color.sql
```

```sql
ALTER TABLE "roadmap_templates" ADD COLUMN "color" varchar(7);
```

#### 4. Apply Migration

```bash
npm run db:migrate
```

This applies pending migrations to your database.

**Note:** Use `DATABASE_URL` (direct connection) in `.env` for migrations, not the pooled URL.

### Available Commands

```bash
# Generate migration from schema changes
npm run db:generate

# Apply migrations to database
npm run db:migrate

# Push schema directly (skip migration files - dev only)
npm run db:push

# Open Drizzle Studio (visual database explorer)
npm run db:studio
```

### Quick Reference: When to Use Each Command

| Command | When to Use | Production Safe? |
|---------|-------------|------------------|
| `db:generate` | After changing schema files | ✅ Yes - creates migration files |
| `db:migrate` | Apply pending migrations | ✅ Yes - runs migration files |
| `db:push` | Rapid prototyping (no migration files) | ⚠️ Dev only - doesn't create migration history |
| `db:studio` | Visual database exploration | ✅ Yes - read-only by default |

### Migration File Structure

After running migrations, your directory will look like:

```
apps/backend/src/db/migrations/
├── 0000_rapid_black_panther.sql      # Initial schema (generated from current state)
├── 0001_add_template_color.sql       # Your first change
├── 0002_add_user_preferences.sql     # Your second change
└── meta/
    ├── _journal.json                  # Migration history
    └── 0000_snapshot.json             # Schema snapshots
```

### Manual SQL Migrations (Advanced)

If you need to write custom SQL that Drizzle can't generate automatically, you can create a migration file manually:

```bash
# Create empty migration file
npm run db:generate -- --custom --name=custom_indexes

# Edit the file and add your SQL
# Then apply with npm run db:migrate
```

### Migration Best Practices

1. **Always use transactions:**

   ```sql
   BEGIN;

   CREATE TABLE users (...);
   CREATE INDEX idx_users_email ON users(email);

   COMMIT;
   ```

2. **Make migrations idempotent:**

   ```sql
   CREATE TABLE IF NOT EXISTS users (...);
   CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
   ```

3. **Never modify existing migrations** - create new ones instead

4. **Test migrations locally first** before running on production

---

## Production Configuration

### Database Settings

In Supabase Dashboard → **Settings** → **Database**:

1. **Connection Pooling**: Enable (default)
   - Mode: Transaction (recommended)
   - Max connections: 15 (free tier) / 100+ (pro)

2. **Extensions**: Enable required extensions

   ```sql
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search
   ```

3. **SSL Mode**: Always enabled (required for Supabase)

### Security Settings

1. **Row Level Security (RLS)**
   - Enable on all tables
   - Create policies for multi-tenant isolation

   Example:

   ```sql
   ALTER TABLE users ENABLE ROW LEVEL SECURITY;

   CREATE POLICY users_isolation ON users
     USING (organization_id = current_setting('app.current_org_id')::uuid);
   ```

2. **Database Roles**
   - Use `postgres` role for admin operations only
   - Create service role for app: `CREATE ROLE app_service WITH LOGIN PASSWORD 'xxx';`

3. **API Keys** (Supabase specific)
   - Anon key: For client-side operations (if using Supabase client)
   - Service key: For server-side operations (keep secret!)

### Performance Tuning

1. **Indexes**: See `database_schema.md` for critical indexes

2. **Connection Pooling**:

   ```typescript
   const pool = new Pool({
     connectionString: config.database.url,
     max: 20, // Maximum connections
     idleTimeoutMillis: 30000,
     connectionTimeoutMillis: 2000,
   });
   ```

3. **Query Optimization**:
   ```sql
   -- Use EXPLAIN ANALYZE to check query performance
   EXPLAIN ANALYZE
   SELECT * FROM users WHERE organization_id = 'xxx';
   ```

### Monitoring

1. **Supabase Dashboard**:
   - Database → Reports
   - View queries, connections, cache hit rate

2. **Set up alerts**:
   - Connection pool exhaustion
   - Slow queries (>1s)
   - Database size limits

---

## Troubleshooting

### Connection Issues

**Error: `password authentication failed`**

- Double-check password in connection string
- Regenerate password in Supabase dashboard if needed

**Error: `SSL SYSCALL error: EOF detected`**

- Add SSL config to your pool:
  ```typescript
  ssl: {
    rejectUnauthorized: false;
  }
  ```

**Error: `too many connections`**

- Use connection pooling URL (port 6543)
- Reduce `max` in Pool config
- Upgrade Supabase plan

### Migration Issues

**Error: `relation already exists`**

- Use `CREATE TABLE IF NOT EXISTS`
- Or drop table first: `DROP TABLE IF EXISTS table_name;`

**Migration runs but changes don't appear**

- Ensure you're connected to correct database
- Check `DATABASE_URL` matches your Supabase project

### Performance Issues

**Slow queries**

```sql
-- Check slow queries
SELECT
  query,
  calls,
  total_time,
  mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

**High connection count**

```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity;
```

---

## Next Steps

1. ✅ Supabase project created
2. ✅ Connection tested
3. → Run migrations (see `database_schema.md`)
4. → Set up Pinecone (see `vector_schema.md`)
5. → Implement data models in backend

---

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL 15 Documentation](https://www.postgresql.org/docs/15/)
- [Connection Pooling Best Practices](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
