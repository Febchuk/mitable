# Database Schema Management with Drizzle ORM

This guide explains how to work with the database schema, generate migrations, push changes, and seed data using Drizzle ORM.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Understanding the Schema](#understanding-the-schema)
4. [Modifying the Schema](#modifying-the-schema)
5. [Development vs Production Workflows](#development-vs-production-workflows)
6. [Using db:push (Development)](#using-dbpush-development)
7. [Using Migrations (Production)](#using-migrations-production)
8. [Seeding the Database](#seeding-the-database)
9. [⚠️ Updating Seed Script When Schema Changes](#️-updating-seed-script-when-schema-changes)
10. [Common Workflows](#common-workflows)
11. [Drizzle Studio](#drizzle-studio)
12. [Best Practices](#best-practices)
13. [Common Schema Patterns](#common-schema-patterns)
14. [Troubleshooting](#troubleshooting)
15. [Quick Reference](#quick-reference)

---

## Introduction

Mitable uses **Drizzle ORM** for database management:

- **ORM**: Type-safe database queries with full TypeScript support
- **Schema**: Defined in code (`apps/backend/src/db/schema/`)
- **Migrations**: Auto-generated SQL from schema changes
- **Database**: PostgreSQL 15 (hosted on Supabase)

### Key Benefits

- ✅ Type-safe queries - Catch errors at compile time
- ✅ Schema as code - Version control for database structure
- ✅ Auto-generated migrations - No manual SQL writing
- ✅ Type inference - Automatic TypeScript types from schema

---

## Project Structure

```
apps/backend/
├── src/
│   └── db/
│       ├── client.ts                  # Database connection
│       ├── seed.ts                    # Seed script (test data)
│       ├── schema/                    # Schema definitions
│       │   ├── index.ts               # Re-exports all schemas
│       │   ├── users.schema.ts        # Users table
│       │   ├── organizations.schema.ts
│       │   ├── roadmap-templates.schema.ts
│       │   ├── user-roadmaps.schema.ts
│       │   ├── source-materials.schema.ts
│       │   ├── conversations.schema.ts
│       │   ├── experts.schema.ts
│       │   ├── integrations.schema.ts
│       │   └── analytics.schema.ts
│       └── migrations/                # Generated SQL migrations
│           ├── 0000_rapid_black_panther.sql
│           ├── 0001_curvy_nicolaos.sql
│           ├── 0002_auth_trigger.sql
│           └── meta/                  # Migration metadata
├── drizzle.config.ts                  # Drizzle Kit configuration
└── package.json                       # npm scripts
```

### Key Files

| File                 | Purpose                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `drizzle.config.ts`  | Drizzle Kit configuration (schema path, output dir, DB connection) |
| `schema/index.ts`    | Central export point for all schemas                               |
| `schema/*.schema.ts` | Individual table definitions organized by feature                  |
| `migrations/*.sql`   | Auto-generated SQL for schema changes                              |
| `seed.ts`            | Script to populate database with test data                         |
| `client.ts`          | Database connection and Drizzle instance                           |

---

## Understanding the Schema

### Schema File Structure

Each schema file follows this pattern:

```typescript
// apps/backend/src/db/schema/users.schema.ts

import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations.schema";

// 1. Table Definition
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  firstName: varchar("first_name", { length: 100 }),
  role: varchar("role", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 2. Relations (for joins and queries)
export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

// 3. Type Inference
export type User = typeof users.$inferSelect; // For SELECT queries
export type NewUser = typeof users.$inferInsert; // For INSERT queries
```

### Schema Export Pattern

All schemas are re-exported from `schema/index.ts`:

```typescript
// apps/backend/src/db/schema/index.ts

export * from "./users.schema";
export * from "./organizations.schema";
export * from "./roadmap-templates.schema";
export * from "./user-roadmaps.schema";
// ... etc
```

This allows clean imports:

```typescript
import * as schema from "./db/schema/index";

// Access any table
schema.users;
schema.organizations;
schema.roadmapTemplates;
```

---

## Modifying the Schema

### Adding a New Column

**Example**: Add a `phoneNumber` column to users table

1. **Edit the schema file**:

```typescript
// apps/backend/src/db/schema/users.schema.ts

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phoneNumber: varchar("phone_number", { length: 20 }), // NEW COLUMN
  // ... other columns
});
```

2. **Generate migration** or **push to database** (see workflows below)

3. **Update seed script** if this column needs data:

```typescript
// apps/backend/src/db/seed.ts

const userData = [
  {
    email: "sarah@lorikeet.ai",
    phoneNumber: "+1-555-0123", // Add phone data
    // ... other fields
  },
];
```

### Adding a New Table

**Example**: Add a `teams` table

1. **Create new schema file**:

```typescript
// apps/backend/src/db/schema/teams.schema.ts

import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations.schema";

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const teamsRelations = relations(teams, ({ one }) => ({
  organization: one(organizations, {
    fields: [teams.organizationId],
    references: [organizations.id],
  }),
}));

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
```

2. **Export in index.ts**:

```typescript
// apps/backend/src/db/schema/index.ts

export * from "./teams.schema"; // Add this line
```

3. **Add seed function** (see [Updating Seed Script](#️-updating-seed-script-when-schema-changes))

### Modifying a Column

**Example**: Change `email` length from 255 to 320 characters

```typescript
// Before
email: varchar("email", { length: 255 }).notNull().unique(),

// After
email: varchar("email", { length: 320 }).notNull().unique(),
```

⚠️ **Important**: This will generate an `ALTER TABLE` migration

### Adding a Foreign Key

```typescript
export const userRoadmapTasks = pgTable("user_roadmap_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }), // Foreign key
  // ... other columns
});
```

**Cascade Options**:

- `onDelete: "cascade"` - Delete child rows when parent is deleted
- `onDelete: "set null"` - Set child FK to null when parent is deleted
- `onDelete: "no action"` - Prevent deletion if children exist

### Adding an Index

```typescript
import { index } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    // ... columns
  },
  (table) => ({
    emailIdx: index("email_idx").on(table.email),
    orgIdx: index("org_idx").on(table.organizationId),
  })
);
```

---

## Development vs Production Workflows

Drizzle offers two approaches for applying schema changes:

### Option 1: db:push (Development)

**Use for**: Local development, quick iterations, prototyping

**Pros**:

- ✅ Fast - No migration files
- ✅ Simple - One command
- ✅ Good for experimentation

**Cons**:

- ❌ No migration history
- ❌ Can't rollback
- ❌ Not safe for production
- ❌ Team members must manually sync

**Command**:

```bash
npm run db:push --workspace=apps/backend
```

### Option 2: Migrations (Production)

**Use for**: Production, team collaboration, version control

**Pros**:

- ✅ Version controlled SQL files
- ✅ Reproducible across environments
- ✅ Rollback capability
- ✅ Team-friendly
- ✅ Audit trail

**Cons**:

- ❌ Two-step process (generate + migrate)
- ❌ Must commit migration files

**Commands**:

```bash
npm run db:generate --workspace=apps/backend  # Generate migration
npm run db:migrate --workspace=apps/backend   # Apply migration
```

### When to Use Which

| Scenario              | Use                   |
| --------------------- | --------------------- |
| Local experimentation | `db:push`             |
| Team development      | Migrations            |
| Production deployment | Migrations (ALWAYS)   |
| Quick prototype       | `db:push`             |
| Adding test data      | `db:push` + `db:seed` |
| Preparing for PR      | Migrations            |

---

## Using db:push (Development)

### Quick Start

1. **Modify your schema**:

   ```typescript
   // apps/backend/src/db/schema/users.schema.ts
   export const users = pgTable("users", {
     // ... existing columns
     bio: varchar("bio", { length: 500 }), // NEW
   });
   ```

2. **Push to database**:

   ```bash
   npm run db:push --workspace=apps/backend
   ```

3. **Output**:

   ```
   No config path provided, using default 'drizzle.config.ts'
   Reading config file '/path/to/drizzle.config.ts'
   Pulling schema from database...
   Changes detected in schema

   [✓] bio varchar(500) added to public.users

   Applying changes...
   ✅ Changes applied
   ```

### What db:push Does

1. Connects to your database
2. Compares current schema with your code
3. Generates SQL to sync the database
4. **Immediately executes** the SQL
5. No migration files created

### Use Case Example

```bash
# Day 1: Add a column
npm run db:push --workspace=apps/backend

# Day 2: Remove the column (realized it wasn't needed)
npm run db:push --workspace=apps/backend

# Day 3: Add it back with different type
npm run db:push --workspace=apps/backend
```

No migration files clutter your repo during exploration!

---

## Using Migrations (Production)

### Step 1: Generate Migration

After modifying your schema:

```bash
npm run db:generate --workspace=apps/backend
```

**What happens**:

1. Drizzle Kit analyzes your schema files
2. Compares with previous migration state
3. Generates SQL file in `src/db/migrations/`
4. Prompts for migration name (optional)

**Example Output**:

```
No config path provided, using default 'drizzle.config.ts'
Reading config file '/path/to/drizzle.config.ts'

Generated 1 migration:
  - 0004_users_add_bio_column.sql

✔ Migration(s) generated!
```

**Generated SQL** (`migrations/0004_users_add_bio_column.sql`):

```sql
ALTER TABLE "users" ADD COLUMN "bio" varchar(500);
```

### Step 2: Review Migration

**ALWAYS review the generated SQL**:

```bash
cat apps/backend/src/db/migrations/0004_users_add_bio_column.sql
```

Check for:

- ✅ Correct table names
- ✅ Correct column types
- ✅ Foreign keys are correct
- ✅ No unexpected DROP statements
- ⚠️ Data loss operations (DROP COLUMN, ALTER TYPE that requires cast)

### Step 3: Apply Migration

```bash
npm run db:migrate --workspace=apps/backend
```

**What happens**:

1. Connects to database
2. Checks which migrations have been applied
3. Runs new migrations in order
4. Records migration in `__drizzle_migrations` table

**Output**:

```
No config path provided, using default 'drizzle.config.ts'
Reading config file '/path/to/drizzle.config.ts'

Applying migrations...
[✓] 0004_users_add_bio_column.sql applied

✅ Migration(s) applied successfully!
```

### Step 4: Commit Migration Files

```bash
git add apps/backend/src/db/migrations/
git commit -m "Add bio column to users table"
```

**Important**: Commit both:

- The `.sql` file
- The `meta/*.json` metadata files

---

## Seeding the Database

Seeding populates your database with test data for development.

### Running the Seed Script

```bash
npm run db:seed --workspace=apps/backend
```

**What it does**:

1. Clears existing data (deletes Supabase Auth users + database tables)
2. Seeds organization
3. Creates test users (with Supabase Auth accounts)
4. Seeds templates, source materials, conversations, nudges, etc.
5. Links related data (e.g., tasks to sources)

**Output**:

```
🌱 Starting database seed for Lorikeet...

🧹 Clearing Supabase Auth users...
✅ Deleted 17 Supabase Auth users
🧹 Clearing database tables...
✅ Database cleared

📦 Seeding organization...
✅ Created organization: Lorikeet

👥 Seeding users...
Creating auth user for sarah@lorikeet.ai...
Creating auth user for emily@lorikeet.ai...
✅ Created 17 users with Supabase Auth accounts
🔑 All accounts use password: Password123!

📚 Seeding source materials...
✅ Created 29 source materials

📋 Seeding templates...
✅ Created 6 templates with tasks

🔗 Linking tasks to source materials...
✅ Linked 182 task-source associations

💬 Seeding conversations...
✅ Created 14 conversations with 35 messages

📊 Seed Summary:
  - Organization: Lorikeet
  - Users: 17 (3 admins, 14 employees)
  - Source Materials: 29
  - Templates: 6
  - Roadmap Tasks: 121
  - Conversations: 14

🎉 Database seeded successfully!
```

### Seed Script Structure

```typescript
// apps/backend/src/db/seed.ts

// 1. Clear existing data
await clearDatabase();

// 2. Seed in dependency order
const organization = await seedOrganization();
const users = await seedUsers(organization.id);
const materials = await seedSourceMaterials(organization.id);
const templates = await seedTemplates(organization.id, materials);
await linkTasksToSources(materials); // Junction table
const assignments = await seedUserAssignments(users, templates);
await seedUserRoadmapTasks(users, templates, assignments);
// ... etc

// 3. Summary
console.log("📊 Seed Summary:");
console.log(`  - Users: ${users.length}`);
```

### Seed Function Pattern

```typescript
async function seedUsers(organizationId: string) {
  console.log("👥 Seeding users...");

  const userData = [
    {
      email: "sarah@lorikeet.ai",
      firstName: "Sarah",
      lastName: "Chen",
      role: "admin",
    },
    // ... more users
  ];

  const users: schema.User[] = [];

  for (const user of userData) {
    // Create Supabase Auth user
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: {
        first_name: user.firstName,
        last_name: user.lastName,
        organization_id: organizationId,
      },
    });

    if (error) {
      console.error(`Failed to create ${user.email}:`, error);
      continue;
    }

    users.push({
      id: data.user!.id,
      organizationId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      // ... other fields
    });
  }

  // Bulk insert into database
  await db.insert(schema.users).values(users);

  console.log(`✅ Created ${users.length} users`);
  return users;
}
```

---

## ⚠️ Updating Seed Script When Schema Changes

**CRITICAL**: When you change the schema, you MUST update the seed script to match!

### Why This Matters

```typescript
// ❌ BAD: Schema changed but seed script didn't
// Schema: Added required `department` column
export const users = pgTable("users", {
  // ... other columns
  department: varchar("department", { length: 100 }).notNull(), // NEW!
});

// Seed script: Still missing department
const userData = [
  {
    email: "sarah@lorikeet.ai",
    firstName: "Sarah",
    // Missing department! ❌
  },
];

// Result: Seed script will fail with "null value violates not-null constraint"
```

### Common Schema Changes Requiring Seed Updates

#### 1. Adding a Required Column

**Schema Change**:

```typescript
export const users = pgTable("users", {
  // ... existing columns
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(), // NEW
});
```

**Seed Update**:

```typescript
const userData = [
  {
    email: "sarah@lorikeet.ai",
    firstName: "Sarah",
    phoneNumber: "+1-555-0123", // ADD THIS
  },
  {
    email: "emily@lorikeet.ai",
    firstName: "Emily",
    phoneNumber: "+1-555-0456", // ADD THIS
  },
];
```

#### 2. Adding a New Table

**Schema Change**:

```typescript
// apps/backend/src/db/schema/teams.schema.ts
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  organizationId: uuid("organization_id").notNull(),
});
```

**Seed Update**:

```typescript
// apps/backend/src/db/seed.ts

// Add new seed function
async function seedTeams(organizationId: string) {
  console.log("👥 Seeding teams...");

  const teams = await db
    .insert(schema.teams)
    .values([
      { name: "Engineering", organizationId },
      { name: "Product", organizationId },
      { name: "Design", organizationId },
    ])
    .returning();

  console.log(`✅ Created ${teams.length} teams`);
  return teams;
}

// Call in main seed function
async function main() {
  const organization = await seedOrganization();
  const teams = await seedTeams(organization.id); // ADD THIS
  const users = await seedUsers(organization.id);
  // ... etc
}
```

#### 3. Adding a Foreign Key / Relationship

**Schema Change**:

```typescript
export const users = pgTable("users", {
  // ... existing columns
  teamId: uuid("team_id").references(() => teams.id), // NEW FK
});
```

**Seed Update**:

```typescript
async function seedUsers(organizationId: string, teams: schema.Team[]) {
  const userData = [
    {
      email: "sarah@lorikeet.ai",
      teamId: teams[0].id, // Reference engineering team
    },
    {
      email: "emily@lorikeet.ai",
      teamId: teams[0].id, // Reference engineering team
    },
  ];

  // ... insert logic
}

// Update call site
async function main() {
  const organization = await seedOrganization();
  const teams = await seedTeams(organization.id);
  const users = await seedUsers(organization.id, teams); // Pass teams!
  // ... etc
}
```

#### 4. Adding a Junction Table (Many-to-Many)

**Schema Change**:

```typescript
// apps/backend/src/db/schema/user-teams.schema.ts
export const userTeams = pgTable(
  "user_teams",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.teamId] }),
  })
);
```

**Seed Update**:

```typescript
async function seedUserTeams(users: schema.User[], teams: schema.Team[]) {
  console.log("🔗 Linking users to teams...");

  const links = [
    { userId: users[0].id, teamId: teams[0].id },
    { userId: users[1].id, teamId: teams[0].id },
    { userId: users[2].id, teamId: teams[1].id },
    // ... more links
  ];

  await db.insert(schema.userTeams).values(links);

  console.log(`✅ Linked ${links.length} user-team associations`);
}

// Call in main
async function main() {
  const organization = await seedOrganization();
  const teams = await seedTeams(organization.id);
  const users = await seedUsers(organization.id);
  await seedUserTeams(users, teams); // ADD THIS
  // ... etc
}
```

#### 5. Changing Column Type

**Schema Change**:

```typescript
// Before
currentWeek: integer("current_week").default(1),

// After
currentWeek: varchar("current_week", { length: 10 }).default("Week 1"),
```

**Seed Update**:

```typescript
// Before
const userData = [{ currentWeek: 3 }];

// After
const userData = [
  { currentWeek: "Week 3" }, // Update to string!
];
```

### Real Example from Mitable Codebase

When we added `sources` to roadmap tasks, we had to:

**1. Schema Change** (already existed):

```typescript
// roadmap-templates.schema.ts
export const roadmapTemplateSources = pgTable("roadmap_template_sources", {
  templateTaskId: uuid("template_task_id").notNull(),
  sourceId: uuid("source_id").notNull(),
});
```

**2. Seed Script Update**:

```typescript
// seed.ts - Added new function
async function linkTasksToSources(materials: schema.SourceMaterial[]) {
  console.log("🔗 Linking tasks to source materials...");

  const allTasks = await db.query.roadmapTemplateTasks.findMany();
  const junctionEntries: schema.NewRoadmapTemplateSource[] = [];

  for (const task of allTasks) {
    // Find 3-4 relevant sources for each task
    const relevantSources = findRelevantSources(task, materials);

    for (const source of relevantSources) {
      junctionEntries.push({
        templateTaskId: task.id,
        sourceId: source.id,
      });
    }
  }

  await db.insert(schema.roadmapTemplateSources).values(junctionEntries);

  console.log(`✅ Linked ${junctionEntries.length} task-source associations`);
}

// Main function - ADDED THE CALL
async function main() {
  // ...
  const materials = await seedSourceMaterials(organization.id);
  const templates = await seedTemplates(organization.id, materials);
  await linkTasksToSources(materials); // NEW LINE! ✨
  // ...
}
```

### Checklist: Schema Change → Seed Update

When modifying schema, ask yourself:

- [ ] Did I add a required (`.notNull()`) column?
  - → Update seed data to include values for this column
- [ ] Did I add a new table?
  - → Create a seed function for this table
  - → Call it in the main seed function
- [ ] Did I add a foreign key?
  - → Update seed function to pass referenced entities
  - → Ensure referenced data is seeded first
- [ ] Did I add a junction table?
  - → Create seed function to populate relationships
- [ ] Did I change a column type?
  - → Update seed data to match new type
- [ ] Did I add a default value?
  - → Optional: Can omit from seed data (DB will use default)

### Testing Your Seed Script

After schema changes:

```bash
# 1. Drop all tables and start fresh
npm run db:push --workspace=apps/backend

# 2. Run seed script
npm run db:seed --workspace=apps/backend

# 3. Check for errors
# ✅ If successful, you're good!
# ❌ If it fails, check the error message and update seed script
```

---

## Common Workflows

### Workflow A: Quick Local Development

**Use when**: Experimenting, rapid prototyping, solo development

```bash
# 1. Modify schema
vim apps/backend/src/db/schema/users.schema.ts

# 2. Push to database immediately
npm run db:push --workspace=apps/backend

# 3. Update seed script if needed
vim apps/backend/src/db/seed.ts

# 4. Re-seed database
npm run db:seed --workspace=apps/backend

# 5. Test your changes
npm run dev --workspace=apps/backend
```

**Result**: Fast iteration, no migration files cluttering repo

---

### Workflow B: Production-Ready Development

**Use when**: Team collaboration, preparing for production, creating PR

```bash
# 1. Create feature branch
git checkout -b feature/add-teams-table

# 2. Modify schema
vim apps/backend/src/db/schema/teams.schema.ts

# 3. Generate migration
npm run db:generate --workspace=apps/backend

# 4. Review generated SQL
cat apps/backend/src/db/migrations/0005_add_teams_table.sql

# 5. Apply migration to your local DB
npm run db:migrate --workspace=apps/backend

# 6. Update seed script
vim apps/backend/src/db/seed.ts

# 7. Test with fresh seed
npm run db:seed --workspace=apps/backend

# 8. Verify everything works
npm run dev --workspace=apps/backend

# 9. Commit migration files
git add apps/backend/src/db/migrations/
git add apps/backend/src/db/seed.ts
git commit -m "Add teams table and seed data"

# 10. Push and create PR
git push origin feature/add-teams-table
```

**Result**: Version-controlled, reproducible, team-friendly

---

### Workflow C: Applying Teammate's Migration

**When**: Pulling changes that include new migrations

```bash
# 1. Pull latest changes
git pull origin main

# 2. Install any new dependencies (if package.json changed)
npm install

# 3. Apply new migrations
npm run db:migrate --workspace=apps/backend

# 4. Re-seed to get latest test data
npm run db:seed --workspace=apps/backend

# 5. Continue development
npm run dev --workspace=apps/backend
```

---

### Workflow D: Fixing a Bad Migration

**If you generated a migration but haven't pushed it yet**:

```bash
# 1. Delete the migration file
rm apps/backend/src/db/migrations/0005_bad_migration.sql

# 2. Delete metadata
rm -rf apps/backend/src/db/migrations/meta/0005*

# 3. Fix your schema
vim apps/backend/src/db/schema/users.schema.ts

# 4. Generate new migration
npm run db:generate --workspace=apps/backend

# 5. Review and apply
npm run db:migrate --workspace=apps/backend
```

**⚠️ If migration was already pushed and others have applied it**:

- DON'T delete the migration
- Create a new migration to fix it
- Or coordinate with team to reset migrations

---

## Drizzle Studio

Visual database browser and editor.

### Launch Studio

```bash
npm run db:studio --workspace=apps/backend
```

**Opens**: `https://local.drizzle.studio`

### Features

- 📊 **Browse Tables** - View all tables and data
- ✏️ **Edit Data** - Click cells to edit inline
- 🔍 **Search & Filter** - Find specific rows
- 🔗 **View Relations** - See foreign key relationships
- ➕ **Add Rows** - Insert new data via UI

### Use Cases

- Quick data inspection during development
- Debugging seed data
- Manual data corrections
- Understanding table relationships
- Verifying migrations applied correctly

### Security Note

⚠️ Studio connects directly to your database. Be careful in production!

---

## Best Practices

### 1. Never Modify Existing Migrations

**❌ DON'T**:

```bash
# Edit a migration that's already been applied
vim apps/backend/src/db/migrations/0001_old_migration.sql
```

**✅ DO**:

```bash
# Create a new migration to make changes
npm run db:generate --workspace=apps/backend
```

**Why**: Other developers may have already applied the old migration. Modifying it creates conflicts.

---

### 2. Always Review Generated Migrations

Before applying:

```bash
cat apps/backend/src/db/migrations/0005_new_migration.sql
```

**Check for**:

- ✅ Correct table/column names
- ✅ Appropriate data types
- ⚠️ Data loss operations (DROP, ALTER TYPE)
- ⚠️ Performance impacts (adding indexes to large tables)

---

### 3. Use Descriptive Migration Names

Drizzle auto-generates names like `0005_silky_cyclops`. You can provide custom names:

```bash
npm run db:generate --workspace=apps/backend
# When prompted: add_teams_table_and_user_team_relationship
```

Result: `0005_add_teams_table_and_user_team_relationship.sql`

---

### 4. Test Migrations on Staging First

```bash
# Deploy to staging
DATABASE_URL=<staging-url> npm run db:migrate --workspace=apps/backend

# Verify it works
# Test the application

# Then deploy to production
DATABASE_URL=<production-url> npm run db:migrate --workspace=apps/backend
```

---

### 5. Keep Seed Script in Sync

**Rule**: If you change the schema, update the seed script in the same commit.

```bash
git log --oneline
# ✅ Good: Both changed together
abc123 Add teams table and seed function

# ❌ Bad: Schema change without seed update
def456 Add teams table
```

---

### 6. Use Transactions for Complex Seeds

```typescript
async function seedComplexRelationships() {
  await db.transaction(async (tx) => {
    const users = await tx.insert(schema.users).values([...]).returning();
    const teams = await tx.insert(schema.teams).values([...]).returning();
    await tx.insert(schema.userTeams).values([...]);
  });

  // All-or-nothing: If any fails, all rollback
}
```

---

### 7. Document Breaking Changes

If a migration requires manual intervention:

```sql
-- Migration: 0006_change_email_type.sql
-- BREAKING: This migration requires downtime
-- Manual step: Validate all emails match new format before running

ALTER TABLE users ALTER COLUMN email TYPE varchar(320);
```

Add a comment in the migration file and notify team.

---

### 8. Use db:push for Local, Migrations for Production

| Environment | Use                                |
| ----------- | ---------------------------------- |
| Local dev   | `db:push` (fast iteration)         |
| Staging     | Migrations (reproducible)          |
| Production  | Migrations (ALWAYS)                |
| CI/CD       | Migrations (automated deployments) |

---

## Common Schema Patterns

### Pattern 1: UUID Primary Keys

```typescript
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Auto-generates UUID on insert
});
```

### Pattern 2: Timestamps

```typescript
export const users = pgTable("users", {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // Auto-sets current time on insert
});
```

**Note**: `updatedAt` doesn't auto-update. Update it manually:

```typescript
await db
  .update(schema.users)
  .set({
    firstName: "New Name",
    updatedAt: new Date(), // Explicitly set
  })
  .where(eq(schema.users.id, userId));
```

### Pattern 3: Foreign Keys with Cascading

```typescript
export const userRoadmapTasks = pgTable("user_roadmap_tasks", {
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // When user is deleted, all their tasks are deleted too
});
```

### Pattern 4: JSONB for Flexible Data

```typescript
export const integrations = pgTable("integrations", {
  metadata: jsonb("metadata")
    .$type<{
      webhookUrl?: string;
      apiVersion?: string;
      customSettings?: Record<string, any>;
    }>()
    .default({}),
});
```

**Usage**:

```typescript
await db.insert(schema.integrations).values({
  metadata: {
    webhookUrl: "https://...",
    apiVersion: "2.0",
  },
});
```

### Pattern 5: Enums vs Varchar

**Option A: Varchar** (what Mitable uses):

```typescript
role: varchar("role", { length: 50 }).notNull(),  // 'admin' | 'employee'
```

**Option B: PostgreSQL Enum**:

```typescript
import { pgEnum } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "employee"]);

export const users = pgTable("users", {
  role: roleEnum("role").notNull(),
});
```

**Mitable uses varchar** for flexibility (easier to add new roles without migrations).

### Pattern 6: Junction Tables (Many-to-Many)

```typescript
export const roadmapTemplateSources = pgTable(
  "roadmap_template_sources",
  {
    templateTaskId: uuid("template_task_id")
      .notNull()
      .references(() => roadmapTemplateTasks.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sourceMaterials.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.templateTaskId, table.sourceId] }),
  })
);
```

**Composite primary key**: Both columns together are unique.

---

## Troubleshooting

### Error: "Column does not exist"

**Symptom**:

```
PostgresError: column "phone_number" does not exist
```

**Cause**: Schema changed but database not updated

**Fix**:

```bash
# Development
npm run db:push --workspace=apps/backend

# Production
npm run db:generate --workspace=apps/backend
npm run db:migrate --workspace=apps/backend
```

---

### Error: "Null value violates not-null constraint"

**Symptom**:

```
PostgresError: null value in column "department" violates not-null constraint
```

**Cause**: Seed script missing required column

**Fix**: Update seed script to provide value:

```typescript
const userData = [
  {
    email: "sarah@lorikeet.ai",
    department: "Engineering", // ADD THIS
  },
];
```

---

### Error: "Foreign key constraint violation"

**Symptom**:

```
PostgresError: insert or update on table "users" violates foreign key constraint
```

**Cause**: Trying to insert row with FK that doesn't exist

**Fix**: Ensure referenced data is seeded first:

```typescript
// ✅ Correct order
const organization = await seedOrganization();
const users = await seedUsers(organization.id); // References organization

// ❌ Wrong order
const users = await seedUsers(organization.id); // organization not created yet!
const organization = await seedOrganization();
```

---

### Error: "Cannot connect to database"

**Symptom**:

```
Error: connect ECONNREFUSED
```

**Cause**: DATABASE_URL is incorrect or database is down

**Fix**:

```bash
# 1. Check .env file
cat apps/backend/.env

# 2. Verify DATABASE_URL format
# postgresql://user:password@host:5432/database?sslmode=require

# 3. Test connection
psql $DATABASE_URL
```

---

### Error: "Migration already applied"

**Symptom**:

```
Error: Migration 0005_* already applied
```

**Cause**: Trying to re-run a migration

**Fix**: This is expected behavior. Drizzle tracks applied migrations.

If you need to re-apply:

```sql
-- Connect to database
psql $DATABASE_URL

-- Check applied migrations
SELECT * FROM __drizzle_migrations;

-- Remove record (use with caution!)
DELETE FROM __drizzle_migrations WHERE name = '0005_migration_name';
```

⚠️ **Danger**: Only do this if you're sure the migration wasn't actually applied!

---

### Error: Seed script fails after schema change

**Symptom**:

```
Error: Seed failed at seedUsers
```

**Cause**: Seed script doesn't match new schema

**Fix**: See [Updating Seed Script](#️-updating-seed-script-when-schema-changes) section

---

## Quick Reference

### NPM Scripts

```bash
# Schema Management
npm run db:push --workspace=apps/backend         # Push schema changes directly (dev)
npm run db:generate --workspace=apps/backend     # Generate migration from schema
npm run db:migrate --workspace=apps/backend      # Apply pending migrations

# Data Management
npm run db:seed --workspace=apps/backend         # Populate with test data
npm run db:studio --workspace=apps/backend       # Open Drizzle Studio

# Development
npm run dev --workspace=apps/backend             # Start dev server
npm run typecheck --workspace=apps/backend       # Check TypeScript types
```

### Drizzle ORM Query Examples

```typescript
import { db } from "./db/client";
import * as schema from "./db/schema";
import { eq, and, or } from "drizzle-orm";

// SELECT
const users = await db.select().from(schema.users);
const user = await db.query.users.findFirst({
  where: eq(schema.users.email, "sarah@lorikeet.ai"),
});

// INSERT
const [newUser] = await db
  .insert(schema.users)
  .values({
    email: "new@example.com",
    firstName: "New",
    role: "employee",
    organizationId: "uuid",
  })
  .returning();

// UPDATE
await db.update(schema.users).set({ firstName: "Updated" }).where(eq(schema.users.id, userId));

// DELETE
await db.delete(schema.users).where(eq(schema.users.id, userId));

// JOIN
const usersWithOrg = await db.query.users.findMany({
  with: {
    organization: true,
  },
});

// WHERE
const admins = await db.select().from(schema.users).where(eq(schema.users.role, "admin"));

const filtered = await db
  .select()
  .from(schema.users)
  .where(and(eq(schema.users.role, "admin"), eq(schema.users.status, "active")));
```

### Schema Definition Cheat Sheet

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  numeric,
  serial,
} from "drizzle-orm/pg-core";

export const example = pgTable("example", {
  // UUID primary key (recommended)
  id: uuid("id").primaryKey().defaultRandom(),

  // Text fields
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),

  // Numbers
  count: integer("count").default(0),
  price: numeric("price", { precision: 10, scale: 2 }),

  // Boolean
  isActive: boolean("is_active").default(true),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),

  // Date only
  birthDate: date("birth_date"),

  // JSON
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),

  // Foreign key
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Unique constraint
  email: varchar("email", { length: 255 }).notNull().unique(),
});
```

---

## Environment Variables

Required in `.env` file:

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/database?sslmode=require

# Supabase (for Auth in seed script)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Get Supabase connection string**:

1. Go to Supabase dashboard
2. Settings → Database
3. Copy "Connection string" → "URI"
4. Replace `[YOUR-PASSWORD]` with actual password

---

## Summary

### Key Takeaways

1. **Use db:push for development**, migrations for production
2. **Always update seed script** when schema changes
3. **Review generated migrations** before applying
4. **Seed in dependency order** (organizations → users → tasks)
5. **Never modify existing migrations** (create new ones instead)
6. **Test on staging first** before production migrations

### Common Commands

```bash
# Development workflow
npm run db:push --workspace=apps/backend
npm run db:seed --workspace=apps/backend

# Production workflow
npm run db:generate --workspace=apps/backend
npm run db:migrate --workspace=apps/backend

# Visual database browser
npm run db:studio --workspace=apps/backend
```

### When in Doubt

1. Check the schema files in `apps/backend/src/db/schema/`
2. Look at existing migration files for patterns
3. Review the seed script for data structure examples
4. Use Drizzle Studio to inspect database state

---

## Additional Resources

- **Drizzle Docs**: https://orm.drizzle.team/docs/overview
- **Drizzle Kit Docs**: https://orm.drizzle.team/kit-docs/overview
- **API Documentation**: `docs/API_DOCUMENTATION.md`
- **Database Schema**: `docs/database_schema.md`
- **Supabase Setup**: `docs/supabase_setup.md`

---

**Happy Schema Management!** 🚀
