# Phase 1: Foundation — Schema + Permissions Service

## Goal

Add the database columns and tables needed for hierarchy, create a centralized permissions service, and expose the first manager-assignment endpoint. No UI changes. Existing flat orgs continue working with zero changes.

---

## 1. Database Migration

### 1.1 Add columns to `users` table

**File:** `apps/backend/src/db/schema/users.schema.ts`

Add three nullable columns:

```typescript
managerId: uuid("manager_id").references(() => users.id, { onDelete: "set null" }),
teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
department: varchar("department", { length: 100 }),
```

**Why nullable:** Every existing user gets `NULL` for these fields, which means "no manager assigned" — identical to today's flat behavior. Zero data migration needed.

**Index:** Create `idx_users_manager_id` on `manager_id` for fast direct-report lookups.

### 1.2 Update `usersRelations`

Add self-referential relations:

```typescript
export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  manager: one(users, {
    fields: [users.managerId],
    references: [users.id],
    relationName: "managerReports",
  }),
  directReports: many(users, {
    relationName: "managerReports",
  }),
  team: one(teams, {
    fields: [users.teamId],
    references: [teams.id],
  }),
}));
```

### 1.3 Create `teams` table

**New file:** `apps/backend/src/db/schema/teams.schema.ts`

```typescript
import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations.schema";
import { users } from "./users.schema";

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  leaderId: uuid("leader_id").references(() => users.id, { onDelete: "set null" }),
  parentTeamId: uuid("parent_team_id").references(() => teams.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const teamsRelations = relations(teams, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [teams.organizationId],
    references: [organizations.id],
  }),
  leader: one(users, {
    fields: [teams.leaderId],
    references: [users.id],
  }),
  parentTeam: one(teams, {
    fields: [teams.parentTeamId],
    references: [teams.id],
    relationName: "childTeams",
  }),
  childTeams: many(teams, {
    relationName: "childTeams",
  }),
  members: many(users),
}));

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
```

### 1.4 Export from schema index

**File:** `apps/backend/src/db/schema/index.ts`

Add:

```typescript
export * from "./teams.schema.js";
```

### 1.5 Migration SQL

```sql
-- 0001_add_hierarchy.sql

-- Create teams table
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  leader_id UUID REFERENCES users(id) ON DELETE SET NULL,
  parent_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_teams_org ON teams(organization_id);
CREATE INDEX idx_teams_parent ON teams(parent_team_id);

-- Add hierarchy columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100);

CREATE INDEX idx_users_manager_id ON users(manager_id);
CREATE INDEX idx_users_team_id ON users(team_id);
```

---

## 2. Permissions Service

**New file:** `apps/backend/src/services/permissions.service.ts`

This is the central authority for all authorization decisions, replacing the 53+ inline `role !== "admin"` checks scattered across routes.

### 2.1 Core Functions

```typescript
import { db } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { eq, sql, and } from "drizzle-orm";

/**
 * Get all user IDs visible to an actor:
 * - Admin: all users in their org
 * - Manager: self + all transitive reports
 * - Employee: self only
 */
export async function getVisibleUserIds(
  actorId: string,
  organizationId: string,
  role: string
): Promise<string[]> {
  if (role === "admin") {
    const orgUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.organizationId, organizationId));
    return orgUsers.map((u) => u.id);
  }

  // Check if user has any direct reports (i.e., is a manager)
  const reports = await getTransitiveReportIds(actorId);
  return [actorId, ...reports];
}

/**
 * Recursive CTE to get all transitive report IDs.
 * Returns empty array if user has no reports.
 */
export async function getTransitiveReportIds(managerId: string): Promise<string[]> {
  const result = await db.execute(sql`
    WITH RECURSIVE report_tree AS (
      SELECT id FROM users WHERE manager_id = ${managerId}
      UNION ALL
      SELECT u.id FROM users u
      JOIN report_tree rt ON u.manager_id = rt.id
    )
    SELECT id FROM report_tree
  `);
  return (result.rows as { id: string }[]).map((r) => r.id);
}

/**
 * Get direct reports only (not transitive).
 */
export async function getDirectReports(managerId: string) {
  return db.select().from(users).where(eq(users.managerId, managerId));
}

/**
 * Check if actor has at least one direct report.
 */
export async function isManager(userId: string): Promise<boolean> {
  const result = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.managerId, userId))
    .limit(1);
  return result.length > 0;
}

/**
 * Check if actor can view target user's data.
 * True if: actor is admin in same org, actor is target's manager (transitive), or actor IS target.
 */
export async function canViewUserData(
  actorId: string,
  targetUserId: string,
  actorRole: string,
  actorOrgId: string
): Promise<boolean> {
  // Self-access always allowed
  if (actorId === targetUserId) return true;

  // Admin can view anyone in their org
  if (actorRole === "admin") {
    const [target] = await db
      .select({ organizationId: users.organizationId })
      .from(users)
      .where(eq(users.id, targetUserId));
    return target?.organizationId === actorOrgId;
  }

  // Manager can view transitive reports
  const reportIds = await getTransitiveReportIds(actorId);
  return reportIds.includes(targetUserId);
}

/**
 * Check if actor can edit a session (replaces isOwnerOrOrgAdmin).
 * True if: actor owns the session, is admin in same org, or manages the session owner.
 */
export async function canEditSession(
  actorId: string,
  sessionOwnerId: string,
  actorRole: string,
  actorOrgId: string
): Promise<boolean> {
  if (actorId === sessionOwnerId) return true;
  return canViewUserData(actorId, sessionOwnerId, actorRole, actorOrgId);
}

/**
 * Check if actorId is a manager of targetId (direct or transitive).
 */
export async function isManagerOf(actorId: string, targetUserId: string): Promise<boolean> {
  const reportIds = await getTransitiveReportIds(actorId);
  return reportIds.includes(targetUserId);
}
```

### 2.2 Caching Strategy

The recursive CTE is fast for typical org sizes (< 1000 users), but for hot paths (dashboard loading), cache the result per-request:

```typescript
// Attach to Express request object for per-request caching
declare global {
  namespace Express {
    interface Request {
      _visibleUserIds?: string[];
    }
  }
}

export async function getCachedVisibleUserIds(req: Request): Promise<string[]> {
  if (!req._visibleUserIds) {
    req._visibleUserIds = await getVisibleUserIds(req.userId!, req.organizationId!, req.userRole!);
  }
  return req._visibleUserIds;
}
```

---

## 3. Auth Middleware Extension

**File:** `apps/backend/src/middleware/auth.ts`

### 3.1 Extend `requireAuth` to cache role and isManager

After the existing org lookup (line 44-52), add:

```typescript
if (userRecord[0]) {
  req.organizationId = userRecord[0].organizationId;
  req.userRole = userRecord[0].role; // NEW
  req.isManager = userRecord[0].isManager; // NEW (computed, see below)
}
```

**Optimization:** Rather than running `isManager()` on every request, add it to the user lookup query:

```typescript
const userRecord = await db
  .select({
    organizationId: users.organizationId,
    role: users.role,
  })
  .from(users)
  .where(eq(users.id, user.id))
  .limit(1);

// Check if user has any direct reports (lightweight count)
const reportCheck = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.managerId, user.id))
  .limit(1);

if (userRecord[0]) {
  req.organizationId = userRecord[0].organizationId;
  req.userRole = userRecord[0].role;
  req.isManager = reportCheck.length > 0;
}
```

### 3.2 Update Express Request type

**File:** `apps/backend/src/types.d.ts`

Add to the Express Request interface:

```typescript
userRole?: string;
isManager?: boolean;
_visibleUserIds?: string[];
```

---

## 4. Update `/auth/me` Response

**File:** `apps/backend/src/routes/auth.ts` (wherever the `/auth/me` or user profile endpoint is)

Add to the response payload:

```typescript
{
  // ...existing fields...
  isManager: boolean,
  managerId: string | null,
  teamId: string | null,
  department: string | null,
  directReportCount: number,
}
```

This gives the frontend everything it needs to render the correct view.

---

## 5. Manager Assignment Endpoint

**File:** `apps/backend/src/routes/admin.ts`

### 5.1 Set/clear a user's manager

```
PUT /admin/users/:id/manager
Body: { managerId: string | null }
```

**Validation rules:**

- Only admins can assign managers
- Manager and target must be in the same organization
- Cannot set someone as their own manager
- Cannot create circular references (A manages B, B manages A)
- `managerId: null` clears the manager (returns to flat/unassigned)

**Circular reference check:**

```typescript
async function wouldCreateCycle(targetUserId: string, proposedManagerId: string): Promise<boolean> {
  // Walk up the chain from proposedManager. If we reach targetUser, it's a cycle.
  let currentId: string | null = proposedManagerId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === targetUserId) return true;
    if (visited.has(currentId)) return false; // safety: existing cycle detected
    visited.add(currentId);

    const [user] = await db
      .select({ managerId: users.managerId })
      .from(users)
      .where(eq(users.id, currentId));
    currentId = user?.managerId ?? null;
  }
  return false;
}
```

### 5.2 Get org hierarchy tree

```
GET /admin/org-tree
Response: nested tree of users with their reports
```

Returns:

```json
[
  {
    "id": "user-1",
    "name": "CEO",
    "role": "admin",
    "directReports": [
      {
        "id": "user-2",
        "name": "VP Engineering",
        "role": "employee",
        "directReports": [
          { "id": "user-3", "name": "Tech Lead", "directReports": [...] }
        ]
      }
    ]
  }
]
```

Built by querying all org users and assembling the tree in-memory (faster than recursive queries for rendering the full tree).

---

## 6. Shared Types Update

**File:** `packages/shared/src/types.ts`

Update `UserSchema`:

```typescript
export const UserSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.string(),
  department: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
  teamId: z.string().optional().nullable(),
  isManager: z.boolean().optional(),
  startDate: z.string().datetime(),
  createdAt: z.string().datetime(),
});
```

---

## Verification Checklist

- [ ] Run `npm run db:generate --workspace=apps/backend` — migration generates cleanly
- [ ] Run `npm run db:push --workspace=apps/backend` — schema applies to dev DB
- [ ] Existing users have `manager_id = NULL`, `team_id = NULL`, `department = NULL`
- [ ] Existing admin/employee login flows work unchanged
- [ ] `GET /auth/me` returns new fields (`isManager: false`, `managerId: null`, etc.)
- [ ] `PUT /admin/users/:id/manager` works: assign, clear, reject cycles
- [ ] `GET /admin/org-tree` returns flat list (no hierarchy yet) for existing orgs
- [ ] Permissions service: `getVisibleUserIds` returns all org users for admin, self-only for employee
- [ ] `npm run typecheck` passes
- [ ] `npm run test --workspace=apps/backend` passes

---

## Files Modified/Created

| Action | File                                               |
| ------ | -------------------------------------------------- |
| MODIFY | `apps/backend/src/db/schema/users.schema.ts`       |
| CREATE | `apps/backend/src/db/schema/teams.schema.ts`       |
| MODIFY | `apps/backend/src/db/schema/index.ts`              |
| CREATE | `apps/backend/src/services/permissions.service.ts` |
| MODIFY | `apps/backend/src/middleware/auth.ts`              |
| MODIFY | `apps/backend/src/types.d.ts`                      |
| MODIFY | `apps/backend/src/routes/auth.ts`                  |
| MODIFY | `apps/backend/src/routes/admin.ts`                 |
| MODIFY | `packages/shared/src/types.ts`                     |
