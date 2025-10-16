# Roadmap → Template Refactor Plan

**Version:** 1.0
**Date:** 2025-10-15
**Status:** In Progress

---

## Table of Contents

1. [Overview](#overview)
2. [Naming Conventions](#naming-conventions)
3. [Database Schema Changes](#database-schema-changes)
4. [Frontend Type Definitions](#frontend-type-definitions)
5. [Admin UI Refactor](#admin-ui-refactor)
6. [Navigation & Routing](#navigation--routing)
7. [Documentation Updates](#documentation-updates)
8. [Migration Strategy](#migration-strategy)
9. [Implementation Checklist](#implementation-checklist)
10. [Testing Strategy](#testing-strategy)
11. [Rollback Plan](#rollback-plan)

---

## Overview

### Problem Statement
The word "roadmap" is currently overloaded:
- **Admin side:** Creating reusable onboarding plans (should be "templates")
- **Employee side:** User's personalized onboarding journey (should remain "roadmap")
- **Database:** `roadmaps` table is user-specific (1:1 with user), but admin UI treats them as reusable templates

### Solution
Separate **Templates** (admin-created reusable plans) from **Roadmaps** (user-specific journeys) using a **Copy on Assignment** architecture.

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Data Model** | Option A: Copy on Assignment | Users can customize without affecting templates |
| **Multiple Templates** | Yes, with intelligent consolidation | Merge tasks and redistribute across balanced timeline |
| **User Customization** | Full (add/remove/modify tasks) | Admins need flexibility to tailor per individual |
| **Backend Naming** | `roadmap_templates` | Explicit namespace, follows `user_roadmaps` pattern |
| **Frontend Naming** | "Templates" (admin), "Roadmap" (employee) | Clean, contextual |

---

## Naming Conventions

### Backend (Database Layer)

**Schema Files:**
- `apps/backend/src/db/schema/roadmap-templates.schema.ts`
- `apps/backend/src/db/schema/user-roadmaps.schema.ts`

**Table Names:**
- `roadmap_templates` - Admin-created templates
- `roadmap_template_tasks` - Tasks belonging to templates
- `roadmap_template_sources` - Many-to-many link to source_materials
- `user_template_assignments` - Which templates assigned to which users
- `user_roadmap_tasks` - User's actual tasks (copied from templates)

**Type Exports:**
```typescript
// From roadmap-templates.schema.ts
export type RoadmapTemplate = typeof roadmapTemplates.$inferSelect;
export type NewRoadmapTemplate = typeof roadmapTemplates.$inferInsert;
export type RoadmapTemplateTask = typeof roadmapTemplateTasks.$inferSelect;

// From user-roadmaps.schema.ts
export type UserTemplateAssignment = typeof userTemplateAssignments.$inferSelect;
export type UserRoadmapTask = typeof userRoadmapTasks.$inferSelect;
```

### Frontend (UI Layer)

**Component Names:**
- `TemplatesView/` (admin)
- `RoadmapView/` (employee - unchanged)

**UI Labels:**
- Admin: "Templates", "Create Template", "Assign Templates"
- Employee: "Roadmap", "My Roadmap"

**TypeScript Types:**
```typescript
// Simple names since context is clear
interface Template { ... }
interface TemplateTask { ... }
interface UserRoadmapTask { ... }
```

---

## Database Schema Changes

### Step 1: Create `roadmap-templates.schema.ts`

**File:** `apps/backend/src/db/schema/roadmap-templates.schema.ts`

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations.schema";
import { sourceMaterials } from "./source-materials.schema";

// Roadmap Templates (admin-created reusable templates)
export const roadmapTemplates = pgTable("roadmap_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 100 }), // Lucide icon name or emoji
  roleTags: jsonb("role_tags").default("[]"), // Array of role strings
  totalWeeks: integer("total_weeks").notNull().default(4),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Roadmap Template Tasks
export const roadmapTemplateTasks = pgTable("roadmap_template_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => roadmapTemplates.id, { onDelete: "cascade" }),
  weekNumber: integer("week_number").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  timeEstimate: varchar("time_estimate", { length: 50 }), // e.g., "2 hours", "1 day"
  orderIndex: integer("order_index").default(0), // For sorting within week
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Template Task Sources (Many-to-Many)
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

// Relations
export const roadmapTemplatesRelations = relations(roadmapTemplates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [roadmapTemplates.organizationId],
    references: [organizations.id],
  }),
  tasks: many(roadmapTemplateTasks),
}));

export const roadmapTemplateTasksRelations = relations(
  roadmapTemplateTasks,
  ({ one, many }) => ({
    template: one(roadmapTemplates, {
      fields: [roadmapTemplateTasks.templateId],
      references: [roadmapTemplates.id],
    }),
    sources: many(roadmapTemplateSources),
  })
);

export const roadmapTemplateSourcesRelations = relations(
  roadmapTemplateSources,
  ({ one }) => ({
    templateTask: one(roadmapTemplateTasks, {
      fields: [roadmapTemplateSources.templateTaskId],
      references: [roadmapTemplateTasks.id],
    }),
    source: one(sourceMaterials, {
      fields: [roadmapTemplateSources.sourceId],
      references: [sourceMaterials.id],
    }),
  })
);

// Export types
export type RoadmapTemplate = typeof roadmapTemplates.$inferSelect;
export type NewRoadmapTemplate = typeof roadmapTemplates.$inferInsert;
export type RoadmapTemplateTask = typeof roadmapTemplateTasks.$inferSelect;
export type NewRoadmapTemplateTask = typeof roadmapTemplateTasks.$inferInsert;
export type RoadmapTemplateSource = typeof roadmapTemplateSources.$inferSelect;
export type NewRoadmapTemplateSource = typeof roadmapTemplateSources.$inferInsert;
```

### Step 2: Create `user-roadmaps.schema.ts`

**File:** `apps/backend/src/db/schema/user-roadmaps.schema.ts`

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users.schema";
import { roadmapTemplates } from "./roadmap-templates.schema";

// User Template Assignments (tracks which templates assigned to which users)
export const userTemplateAssignments = pgTable("user_template_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  templateId: uuid("template_id")
    .notNull()
    .references(() => roadmapTemplates.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  status: varchar("status", { length: 50 }).default("active"), // 'active' | 'completed' | 'archived'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User Roadmap Tasks (user's actual tasks - copied from templates + custom)
export const userRoadmapTasks = pgTable("user_roadmap_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").references(() => roadmapTemplates.id), // NULL if custom task
  templateTaskId: uuid("template_task_id"), // Reference to original template task (no FK to avoid cascades)
  weekNumber: integer("week_number").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  timeEstimate: varchar("time_estimate", { length: 50 }),
  orderIndex: integer("order_index").default(0),
  completed: boolean("completed").default(false),
  completedAt: timestamp("completed_at"),
  isCustom: boolean("is_custom").default(false), // TRUE if manually added by admin
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const userTemplateAssignmentsRelations = relations(
  userTemplateAssignments,
  ({ one }) => ({
    user: one(users, {
      fields: [userTemplateAssignments.userId],
      references: [users.id],
    }),
    template: one(roadmapTemplates, {
      fields: [userTemplateAssignments.templateId],
      references: [roadmapTemplates.id],
    }),
  })
);

export const userRoadmapTasksRelations = relations(userRoadmapTasks, ({ one }) => ({
  user: one(users, {
    fields: [userRoadmapTasks.userId],
    references: [users.id],
  }),
  template: one(roadmapTemplates, {
    fields: [userRoadmapTasks.templateId],
    references: [roadmapTemplates.id],
  }),
}));

// Export types
export type UserTemplateAssignment = typeof userTemplateAssignments.$inferSelect;
export type NewUserTemplateAssignment = typeof userTemplateAssignments.$inferInsert;
export type UserRoadmapTask = typeof userRoadmapTasks.$inferSelect;
export type NewUserRoadmapTask = typeof userRoadmapTasks.$inferInsert;
```

### Step 3: Update Schema Index

**File:** `apps/backend/src/db/schema/index.ts`

```diff
 // Export all schemas and relations
 export * from "./organizations.schema";
 export * from "./users.schema";
 export * from "./integrations.schema";
 export * from "./experts.schema";
 export * from "./conversations.schema";
-export * from "./roadmaps.schema";
+export * from "./roadmap-templates.schema";
+export * from "./user-roadmaps.schema";
 export * from "./analytics.schema";
```

### Step 4: Delete Old Schema

**Delete:** `apps/backend/src/db/schema/roadmaps.schema.ts`

---

## Frontend Type Definitions

**File:** `apps/electron/src/renderer/console/src/types/index.ts`

**Add after existing types:**

```typescript
// ============================================
// Template Types (Admin-Created)
// ============================================

export interface Template {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  icon?: string;
  roleTags: string[];
  totalWeeks: number;
  tasks?: number;  // Computed field for UI
  usedCount?: number;  // Computed field for UI
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TemplateTask {
  id: string;
  templateId: string;
  weekNumber: number;
  title: string;
  description?: string;
  timeEstimate?: string;
  orderIndex: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// User Roadmap Types
// ============================================

export interface UserTemplateAssignment {
  id: string;
  userId: string;
  templateId: string;
  assignedAt: Date;
  status: "active" | "completed" | "archived";
}

export interface UserRoadmapTask extends Task {
  templateId?: string;        // null if custom task
  templateTaskId?: string;    // original template task reference
  isCustom: boolean;          // true if manually added by admin
}

// Keep existing Week, Task types for backward compatibility
```

---

## Admin UI Refactor

### Directory & File Renames

```bash
# From apps/electron/src/renderer/console/src/components/views/admin/
RoadmapsView/ → TemplatesView/
  index.tsx (stays same name)
  CreateRoadmap.tsx → CreateTemplate.tsx
```

### Component Updates Summary

**TemplatesView/index.tsx:**
- Rename component: `RoadmapsView` → `TemplatesView`
- Update heading: "Roadmaps" → "Templates"
- Update search placeholder: "Search templates..."
- Update button: "Create Template"
- Update navigation: `/templates/new`
- Update mock data: `mockRoadmaps` → `mockTemplates`
- Use `Template` type from types

**CreateTemplate.tsx:**
- Rename component: `CreateRoadmap` → `CreateTemplate`
- Update heading: "Create Template"
- Update navigation: `/templates`
- Update labels: "Template Name", etc.
- Update button: "Import & Generate Template"

**AddNewUser.tsx:**
- Import `Template` type
- Rename: `RoadmapTemplate` → use `Template` type
- Rename: `roadmapTemplates` → `templates`
- Update duration calculation to use `totalWeeks`
- Keep user-facing labels as "Onboarding Roadmap"

**PersonDetail.tsx:**
- Rename: `assignedRoadmaps` → `assignedTemplates`
- Keep heading as "Assigned Roadmaps" (user context)
- Update variable references

---

## Navigation & Routing

### Nav.tsx Updates

```diff
 // Admin navigation
 <nav className="space-y-1 px-2">
   <NavItem to="/dashboard" icon={BarChart3} label="Dashboard" />
   <NavItem to="/people" icon={Users} label="People" />
-  <NavItem to="/roadmaps" icon={Layers} label="Roadmaps" />
+  <NavItem to="/templates" icon={Layers} label="Templates" />
   <NavItem to="/integrations" icon={Plug} label="Integrations" />
 </nav>
```

### App.tsx Updates

```diff
-import RoadmapsView from "./components/views/admin/RoadmapsView";
-import CreateRoadmap from "./components/views/admin/RoadmapsView/CreateRoadmap";
+import TemplatesView from "./components/views/admin/TemplatesView";
+import CreateTemplate from "./components/views/admin/TemplatesView/CreateTemplate";

 // Routes
-<Route path="roadmaps" element={<RoadmapsView />} />
-<Route path="roadmaps/new" element={<CreateRoadmap />} />
+<Route path="templates" element={<TemplatesView />} />
+<Route path="templates/new" element={<CreateTemplate />} />
```

---

## Documentation Updates

### CLAUDE.md

**Database Schema section:**
```markdown
-- Onboarding
roadmap_templates, roadmap_template_tasks, roadmap_template_sources  -- Admin-created templates
user_roadmap_tasks, user_template_assignments                        -- User-specific roadmaps
source_materials                                                      -- Learning resources
```

**Add new section:**
```markdown
## Template Assignment Flow

Mitable uses a **Copy on Assignment** pattern for roadmap templates:

1. **Admin creates template** in `roadmap_templates` with tasks in `roadmap_template_tasks`
2. **Admin assigns template to user** → Creates record in `user_template_assignments`
3. **Tasks are copied** from `roadmap_template_tasks` to `user_roadmap_tasks` with `template_id` and `template_task_id` references
4. **Multiple templates** can be assigned → Tasks merged and redistributed across consolidated timeline
5. **Admins customize** user roadmaps (add/remove/modify tasks) via `is_custom` flag
6. **Template updates** do NOT affect existing user roadmaps (decoupled after copy)
```

---

## Migration Strategy

### Database Migration

Create migration file to:
1. Create new template tables
2. Create user roadmap tables
3. Add indexes
4. Migrate existing data (if any)
5. Drop old tables

Migration will be generated after schema changes are complete using Drizzle.

---

## Implementation Checklist

### Phase 1: Database ✅
- [ ] Create `roadmap-templates.schema.ts`
- [ ] Create `user-roadmaps.schema.ts`
- [ ] Update `schema/index.ts`
- [ ] Delete `roadmaps.schema.ts`
- [ ] Generate and run migration

### Phase 2: Frontend Types ✅
- [ ] Add Template interfaces to `types/index.ts`
- [ ] Run typecheck

### Phase 3: Admin UI ✅
- [ ] Rename directory and files
- [ ] Update `TemplatesView/index.tsx`
- [ ] Update `CreateTemplate.tsx`
- [ ] Update `AddNewUser.tsx`
- [ ] Update `PersonDetail.tsx`

### Phase 4: Navigation ✅
- [ ] Update `Nav.tsx`
- [ ] Update `App.tsx`

### Phase 5: Documentation ✅
- [ ] Update `CLAUDE.md`
- [ ] Create this plan document

### Phase 6: Testing ✅
- [ ] Run TypeScript typecheck
- [ ] Manual UI testing
- [ ] Build verification

---

## Testing Strategy

### Manual Testing Checklist

**Admin Flow:**
- [ ] Navigate to /templates
- [ ] View template library
- [ ] Click "Create Template"
- [ ] Verify all labels updated
- [ ] Go to "Add New User"
- [ ] Select templates
- [ ] Go to person detail
- [ ] Verify "Assigned Roadmaps" section

**Employee Flow:**
- [ ] Navigate to /roadmap
- [ ] Verify roadmap still works
- [ ] Check task detail view

---

## Rollback Plan

### Git Revert
```bash
git log --oneline
git revert <commit-hash>
```

### Database Rollback
Keep old tables temporarily, drop after validation period.

---

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: Database | 2-3 hours | Not Started |
| Phase 2: Types | 30 min | Not Started |
| Phase 3: Admin UI | 2-3 hours | Not Started |
| Phase 4: Navigation | 30 min | Not Started |
| Phase 5: Documentation | 1 hour | In Progress |
| Phase 6: Testing | 1 hour | Not Started |
| **Total** | **7-9 hours** | |

---

## Success Criteria

- [ ] All TypeScript compilation errors resolved
- [ ] All routes working (`/templates`, `/templates/new`)
- [ ] No console errors in browser
- [ ] Database migration successful
- [ ] All admin labels show "Templates"
- [ ] All employee labels still show "Roadmap"
- [ ] Documentation updated and consistent

---

**Status:** Ready for Implementation
**Last Updated:** 2025-10-15
