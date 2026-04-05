# Phase 2: Backend Authorization Refactor

## Goal

Replace all 53+ inline `role !== "admin"` checks with centralized middleware. Make dashboard and data-viewing routes accessible to managers (scoped to their reports). This is the biggest backend change — after this phase, managers can access their reports' data through the API.

**Depends on:** Phase 1 (schema + permissions service must be deployed)

---

## 1. Authorization Middleware

**New file:** `apps/backend/src/middleware/authorization.ts`

Three reusable middleware functions that replace all inline permission checks:

### 1.1 `requireAdmin`

Strict admin-only gate. Used for org settings, user CRUD, integration management.

```typescript
import { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole !== "admin") {
    res.status(403).json({ error: "Forbidden", message: "Admin access required" });
    return;
  }
  next();
}
```

### 1.2 `requireManagerOrAdmin`

Gate for data-viewing routes. Allows admins and anyone who manages at least one person.

```typescript
export function requireManagerOrAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole !== "admin" && !req.isManager) {
    res.status(403).json({ error: "Forbidden", message: "Manager or admin access required" });
    return;
  }
  next();
}
```

### 1.3 `requireAccessToUser(paramName)`

Validates that the authenticated user can view data for the user ID specified in a route param. Used on person-detail endpoints like `/admin/dashboard/people/:id`.

```typescript
import { canViewUserData } from "../services/permissions.service.js";

export function requireAccessToUser(paramName: string = "id") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const targetUserId = req.params[paramName];
    if (!targetUserId) {
      res.status(400).json({ error: "Bad Request", message: `Missing ${paramName} parameter` });
      return;
    }

    const hasAccess = await canViewUserData(
      req.userId!,
      targetUserId,
      req.userRole!,
      req.organizationId!
    );

    if (!hasAccess) {
      res.status(403).json({ error: "Forbidden", message: "You do not have access to this user's data" });
      return;
    }

    next();
  };
}
```

---

## 2. Route Migration Strategy

### Principle: Replace inline checks, don't rewrite routes

Each route file migration follows this pattern:
1. Remove the `verifyAdmin()` call or inline `role !== "admin"` check
2. Add the appropriate middleware to the route definition
3. Add visible-user-ID scoping to data queries

### Migration order (by impact)

| Priority | File | Inline checks | Middleware to use |
|----------|------|--------------|-------------------|
| 1 | `admin-dashboard.ts` | ~22 | `requireManagerOrAdmin` + query scoping |
| 2 | `admin.ts` | ~16 | Mixed: `requireAdmin` for CRUD, `requireManagerOrAdmin` for viewing |
| 3 | `monitoring.ts` | 1 (`isOwnerOrOrgAdmin`) | Replace with `canEditSession` from permissions service |
| 4 | `admin-benchmarks.ts` | several | `requireManagerOrAdmin` for assignment, `requireAdmin` for CRUD |
| 5 | Other route files | scattered | `requireAdmin` or `requireManagerOrAdmin` as appropriate |

---

## 3. admin-dashboard.ts Migration (Priority 1)

This file has the most `verifyAdmin()` calls and is the primary data-viewing surface.

### 3.1 Remove `verifyAdmin()` helper

The existing helper (line ~53) fetches user, checks admin role, returns org context. Replace with middleware chain:

**Before:**
```typescript
router.get("/admin/dashboard", requireAuth, async (req, res) => {
  const admin = await verifyAdmin(req, res);
  if (!admin) return;
  // ... query using admin.organizationId
});
```

**After:**
```typescript
router.get("/admin/dashboard", requireAuth, requireManagerOrAdmin, async (req, res) => {
  const visibleUserIds = await getCachedVisibleUserIds(req);
  // ... query using visibleUserIds instead of whole org
});
```

### 3.2 Query scoping changes

**`GET /admin/dashboard` — Org metrics summary**

Currently queries `org_daily_metrics` (pre-computed org-wide). For managers, compute from `user_daily_activities`:

```typescript
if (req.userRole === "admin") {
  // Use pre-computed org metrics (fast path)
  metrics = await getOrgDailyMetrics(req.organizationId!, period);
} else {
  // Manager: aggregate from individual user activities
  const visibleUserIds = await getCachedVisibleUserIds(req);
  metrics = await aggregateUserMetrics(visibleUserIds, period);
}
```

**`GET /admin/dashboard/people` — User list**

Currently: `WHERE organization_id = :orgId`

After: `WHERE id IN (:visibleUserIds)`

```typescript
const visibleUserIds = await getCachedVisibleUserIds(req);
const people = await db
  .select(/* ... */)
  .from(users)
  .where(inArray(users.id, visibleUserIds))
  .orderBy(asc(users.firstName));
```

**`GET /admin/dashboard/people/:id` — Person detail**

Add `requireAccessToUser("id")` middleware. Query itself doesn't change — it already fetches by user ID.

```typescript
router.get(
  "/admin/dashboard/people/:id",
  requireAuth,
  requireManagerOrAdmin,
  requireAccessToUser("id"),
  async (req, res) => { /* ... */ }
);
```

**All drill-down endpoints**

Filter `user_daily_activities` and `activity_blocks` queries by visible user IDs:

```typescript
const visibleUserIds = await getCachedVisibleUserIds(req);
// Add to existing WHERE clause:
and(
  inArray(userDailyActivities.userId, visibleUserIds),
  // ... existing date/period filters
)
```

### 3.3 Helper: `aggregateUserMetrics`

New function to compute dashboard metrics from individual user activities (for manager view):

```typescript
async function aggregateUserMetrics(
  userIds: string[],
  period: "today" | "week" | "month" | "ytd"
) {
  const { startDate, endDate } = getPeriodDates(period);

  const result = await db
    .select({
      totalActiveTime: sql<number>`COALESCE(SUM(active_seconds), 0)`,
      totalSessions: sql<number>`COALESCE(COUNT(DISTINCT session_id), 0)`,
      // ... other aggregate fields matching org_daily_metrics shape
    })
    .from(userDailyActivities)
    .where(
      and(
        inArray(userDailyActivities.userId, userIds),
        gte(userDailyActivities.date, startDate),
        lte(userDailyActivities.date, endDate)
      )
    );

  return result[0];
}
```

---

## 4. admin.ts Migration (Priority 2)

### 4.1 Route classification

Split existing admin routes into two categories:

**Admin-only (keep `requireAdmin`):**
- `POST /admin/users` — create/invite user
- `POST /admin/users/:id/make-admin` — promote to admin
- `GET /admin/integrations` — org integration management
- `POST/PATCH/DELETE /admin/integrations/*` — integration CRUD
- `GET/PATCH /admin/organization/settings` — org settings
- `GET /admin/templates`, `POST /admin/templates` — template management

**Manager-accessible (change to `requireManagerOrAdmin`):**
- `GET /admin/users` — list users (scoped to visible users)
- `GET /admin/users/:id` — user detail (with `requireAccessToUser`)

### 4.2 User list scoping

**`GET /admin/users`**

```typescript
router.get("/admin/users", requireAuth, requireManagerOrAdmin, async (req, res) => {
  const visibleUserIds = await getCachedVisibleUserIds(req);
  const userList = await db
    .select(/* ... */)
    .from(users)
    .where(inArray(users.id, visibleUserIds));
  // ...
});
```

### 4.3 User detail access check

**`GET /admin/users/:id`**

```typescript
router.get(
  "/admin/users/:id",
  requireAuth,
  requireManagerOrAdmin,
  requireAccessToUser("id"),
  async (req, res) => { /* ... existing logic ... */ }
);
```

---

## 5. monitoring.ts Migration (Priority 3)

### 5.1 Replace `isOwnerOrOrgAdmin`

**Current** (line ~54):
```typescript
async function isOwnerOrOrgAdmin(userId, session) {
  if (session.userId === userId) return true;
  const [user] = await db.select({role, organizationId}).from(users).where(eq(users.id, userId));
  return user?.role === "admin" && user.organizationId === session.organizationId;
}
```

**Replace with:**
```typescript
import { canEditSession } from "../services/permissions.service.js";

// In the route handler:
const allowed = await canEditSession(
  req.userId!,
  session.userId,
  req.userRole!,
  req.organizationId!
);
if (!allowed) {
  res.status(403).json({ error: "Forbidden" });
  return;
}
```

This now allows managers to edit their reports' session summaries (same as admins could before).

---

## 6. admin-benchmarks.ts Migration (Priority 4)

### 6.1 Route classification

**All benchmark routes open to managers (scoped to their reports):**
- `POST /admin/benchmarks` — create benchmark (managers can create for their reports)
- `PUT /admin/benchmarks/:id` — update benchmark (if created by them or assigned to their reports)
- `DELETE /admin/benchmarks/:id` — delete benchmark (if created by them)
- `GET /admin/benchmarks` — list benchmarks (managers see benchmarks for their reports, admins see all)
- `GET /admin/benchmarks/:id` — benchmark detail (scoped)
- `POST /admin/benchmarks/:id/assign` — assign to user (manager can assign to their reports only)

All use `requireManagerOrAdmin` middleware. The key difference is **scoping**: admins operate org-wide, managers operate within their report tree.

### 6.2 Assignment validation for managers

When a manager assigns a benchmark, validate the target user is their report:

```typescript
if (req.userRole !== "admin") {
  const hasAccess = await canViewUserData(req.userId!, targetUserId, req.userRole!, req.organizationId!);
  if (!hasAccess) {
    res.status(403).json({ error: "Can only assign benchmarks to your reports" });
    return;
  }
}
```

---

## 7. New Manager-Specific Endpoints

### 7.1 `GET /me/reports`

Returns the authenticated user's direct reports. Available to anyone (returns empty array for non-managers).

```typescript
router.get("/me/reports", requireAuth, async (req, res) => {
  const reports = await getDirectReports(req.userId!);
  res.json({ reports });
});
```

### 7.2 `GET /me/reports/:id/activity`

Manager-scoped equivalent of the admin person-detail endpoint. Validates access via permissions service.

```typescript
router.get("/me/reports/:id/activity", requireAuth, async (req, res) => {
  const targetId = req.params.id;
  const hasAccess = await canViewUserData(req.userId!, targetId, req.userRole!, req.organizationId!);
  if (!hasAccess) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  // ... same query as admin person-detail endpoint
});
```

---

## 8. Performance Considerations

### 8.1 Recursive CTE performance

For orgs under 1,000 users (vast majority), the recursive CTE completes in < 5ms with the `idx_users_manager_id` index. For larger orgs:

- Cache `visibleUserIds` per-request (already implemented in `getCachedVisibleUserIds`)
- Consider materializing the transitive closure in a separate table if orgs exceed 10,000 users (future optimization)

### 8.2 Query count

Each manager dashboard load adds 1 extra query (the recursive CTE) compared to admin loads (which use pre-computed `org_daily_metrics`). This is acceptable for Phase 2. Phase 4 can add a `team_daily_metrics` materialized view if needed.

---

## Verification Checklist

- [ ] All 53+ inline role checks replaced with middleware
- [ ] Admin login: dashboard shows all org users (unchanged behavior)
- [ ] Manager login: dashboard shows only their transitive reports
- [ ] Employee login: still gets 403 on admin/dashboard routes
- [ ] Manager can view person detail for their report
- [ ] Manager gets 403 viewing person detail for non-report
- [ ] Manager can edit session summary for their report
- [ ] `GET /me/reports` returns direct reports for manager, empty for employee
- [ ] Benchmark assignment by manager limited to their reports
- [ ] `npm run typecheck` passes
- [ ] `npm run test --workspace=apps/backend` passes
- [ ] Load test: dashboard with 3-level hierarchy (20 users) loads < 500ms

---

## Files Modified/Created

| Action | File |
|--------|------|
| CREATE | `apps/backend/src/middleware/authorization.ts` |
| MODIFY | `apps/backend/src/routes/admin-dashboard.ts` (22 changes) |
| MODIFY | `apps/backend/src/routes/admin.ts` (16 changes) |
| MODIFY | `apps/backend/src/routes/monitoring.ts` (1 change) |
| MODIFY | `apps/backend/src/routes/admin-benchmarks.ts` (several changes) |
| MODIFY | `apps/backend/src/routes/my-activity.ts` (add /me/reports endpoints) |
