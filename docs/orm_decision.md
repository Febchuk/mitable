# ORM Decision: Drizzle ORM

**Decision Date**: 2025-10-15
**Status**: Approved

## Summary

We will use **Drizzle ORM** for the Mitable backend PostgreSQL database layer.

## Context

Mitable's backend requires:
- PostgreSQL database via Supabase
- Complex queries for RAG system
- Type safety for production reliability
- Migration management as schema evolves
- Flexibility for custom SQL when needed

## Decision

Use **Drizzle ORM** as the database abstraction layer.

## Rationale

### Why Drizzle?

1. **Type Safety Without Compromise**
   - Auto-generated TypeScript types from schema
   - Compile-time error checking
   - IntelliSense support

2. **SQL-Like Syntax**
   - Readable, predictable query building
   - Easy to learn for anyone who knows SQL
   - Can drop to raw SQL when needed

3. **Migration Management**
   - Built-in migration generator
   - Version-controlled schema changes
   - Safe rollback capabilities

4. **Performance**
   - Zero runtime overhead
   - Small bundle size
   - Direct SQL execution (no heavy abstraction)

5. **Perfect for RAG Use Case**
   - Complex joins for expert matching
   - Aggregations for analytics
   - Flexible enough for hybrid search queries

### Why Not Alternatives?

**Raw SQL (pg library only):**
- ❌ No type safety → runtime errors
- ❌ Manual migration management
- ❌ Too much boilerplate for 50+ tables

**Prisma:**
- ❌ Hides SQL too much (bad for complex queries)
- ❌ Heavy runtime overhead
- ❌ Generated client is large
- ❌ Less flexibility for custom analytics

**Kysely:**
- ⚠️ Good alternative, but no built-in migrations
- ⚠️ Manual type definitions

## Implementation

### Installation

```bash
cd apps/backend
npm install drizzle-orm
npm install -D drizzle-kit
npm install -D pg @types/pg
```

### Configuration

**drizzle.config.ts:**
```typescript
import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

### Project Structure

```
apps/backend/src/
├── db/
│   ├── schema/
│   │   ├── organizations.schema.ts
│   │   ├── users.schema.ts
│   │   ├── integrations.schema.ts
│   │   ├── experts.schema.ts
│   │   ├── conversations.schema.ts
│   │   ├── roadmaps.schema.ts
│   │   ├── analytics.schema.ts
│   │   └── index.ts                 # Export all schemas
│   ├── migrations/                   # Auto-generated
│   │   ├── 0001_initial.sql
│   │   └── meta/
│   ├── repositories/                 # Data access layer
│   │   ├── user.repository.ts
│   │   ├── expert.repository.ts
│   │   └── conversation.repository.ts
│   └── client.ts                     # Drizzle client
```

### Example Schema

**apps/backend/src/db/schema/users.schema.ts:**
```typescript
import { pgTable, uuid, varchar, timestamp, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { organizations } from './organizations.schema.js';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  role: varchar('role', { length: 50 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  currentWeek: integer('current_week').default(1),
  startDate: timestamp('start_date'),
  status: varchar('status', { length: 50 }).default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Define relations for type-safe joins
export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  expertProfile: one(expertProfiles),
  conversations: many(conversations),
  roadmaps: many(roadmaps),
}));

// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

### Example Repository

**apps/backend/src/db/repositories/user.repository.ts:**
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { pool } from '../client.js';
import { users, type User, type NewUser } from '../schema/users.schema.js';

const db = drizzle(pool);

export class UserRepository {
  async findById(id: string): Promise<User | undefined> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return result[0];
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return result[0];
  }

  async create(data: NewUser): Promise<User> {
    const result = await db
      .insert(users)
      .values(data)
      .returning();

    return result[0];
  }

  async findByOrganization(organizationId: string): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(eq(users.organizationId, organizationId));
  }

  // Complex query example (expert matching)
  async findExpertsByTopic(topic: string, orgId: string) {
    // Can still use raw SQL when needed
    return await db.execute(sql`
      SELECT u.*, et.confidence_score, ep.helpfulness_score
      FROM users u
      JOIN expert_profiles ep ON u.id = ep.user_id
      JOIN expert_topics et ON u.id = et.user_id
      WHERE et.topic ILIKE ${`%${topic}%`}
        AND u.organization_id = ${orgId}
        AND ep.response_rate > 0.7
      ORDER BY et.confidence_score DESC, ep.helpfulness_score DESC
      LIMIT 5
    `);
  }
}

export const userRepository = new UserRepository();
```

### Migration Workflow

**Generate migration:**
```bash
npm run db:generate
```

**Apply migration:**
```bash
npm run db:migrate
```

**Add to package.json:**
```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

## Consequences

### Positive

- ✅ Type-safe database queries
- ✅ Automatic migration generation
- ✅ Better developer experience
- ✅ Fewer runtime errors
- ✅ Easy refactoring

### Neutral

- ⚠️ Team needs to learn Drizzle syntax (minimal learning curve)
- ⚠️ Adds ~200KB to bundle (acceptable)

### Negative

- ❌ One more dependency to maintain
- ❌ Slightly slower to set up than raw SQL

## Migration from Raw SQL

If we had started with raw SQL, migration path would be:

1. Define schemas in Drizzle
2. Generate migration (won't change DB, just creates tracking)
3. Gradually replace raw queries with Drizzle
4. Keep raw SQL for complex queries

## Monitoring

We will monitor:
- Query performance (ensure no regressions)
- Bundle size (keep under 500KB total)
- Developer velocity (should improve)

## Review Date

Review this decision after Phase 2 (Slack ingestion) is complete.

If Drizzle causes issues, we can:
- Drop to raw SQL for specific queries
- Evaluate switching to Kysely
- Stay with Drizzle but use more raw SQL

## References

- [Drizzle ORM Documentation](https://orm.drizzle.team)
- [Drizzle with Supabase Guide](https://orm.drizzle.team/docs/get-started-postgresql#supabase)
- [Database Schema Documentation](./database_schema.md)
- [Supabase Setup Guide](./supabase_setup.md)

## Approval

- [x] Approved by: Project team
- [x] Date: 2025-10-15
- [x] Next: Implement in Phase 2
