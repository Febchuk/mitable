# Mitable Tiered Product Implementation Plan

> **Status**: Ready for Implementation
> **Created**: 2025-12-05
> **Priority**: Enable consumer access - NO blocking/enforcement yet

---

## Executive Summary

Transform Mitable from enterprise-only to support both individual consumers (Free/Pro) and enterprise teams (Team tier). Each consumer gets an auto-created "personal organization" to reuse existing data isolation patterns.

**MVP Scope:**
- Consumer signup flow (creates personal organization)
- Subscription/tier tracking in database
- Display usage stats (informational only - NO blocking)
- Different navigation for consumer vs enterprise
- Two signup buttons on login page

**Deferred:**
- Usage limit enforcement (blocking requests)
- Stripe billing integration
- Upgrade prompts when limits exceeded

---

## 1. Tier Definitions

| Resource | Free | Pro | Team |
|----------|------|-----|------|
| AI Queries/month | 50 | 500 | Unlimited |
| Documents | 10 | 100 | Unlimited |
| Storage | 100 MB | 5 GB | Unlimited |
| Team Members | 1 | 1 | Unlimited |
| Integrations | 2 | 4 | Unlimited |
| Sync Frequency | 1x/day | 4x/day | Real-time |

---

## 2. Architecture Decision

**Pattern**: Personal Organization

Each consumer gets an auto-created "personal organization" where they are the admin and only member.

**Why this approach:**
- Reuses existing org-based data isolation (Pinecone namespaces, PostgreSQL filters)
- No schema refactoring required - just add `org_type` column
- Consumer is admin of their own personal org
- Upgrade path: Convert personal org to team org later

---

## 3. Database Changes

### 3.1 New Tables

#### `subscriptions`
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  tier VARCHAR(20) NOT NULL DEFAULT 'free',  -- 'free' | 'pro' | 'team'
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active' | 'cancelled' | 'past_due' | 'trialing'
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  stripe_price_id VARCHAR(255),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMP,
  trial_start TIMESTAMP,
  trial_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

#### `usage_tracking`
```sql
CREATE TABLE usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  ai_queries INTEGER DEFAULT 0,
  documents_uploaded INTEGER DEFAULT 0,
  storage_bytes_used BIGINT DEFAULT 0,
  integration_syncs INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(organization_id, period_start)
);

CREATE INDEX idx_usage_org_period ON usage_tracking(organization_id, period_start);
```

#### `usage_limits` (Reference Table)
```sql
CREATE TABLE usage_limits (
  tier VARCHAR(20) PRIMARY KEY,
  monthly_ai_queries INTEGER,  -- NULL = unlimited
  max_documents INTEGER,
  max_storage_bytes BIGINT,
  max_team_members INTEGER,
  max_integrations INTEGER,
  sync_frequency_hours INTEGER,  -- 24=daily, 6=4x/day, 0=realtime
  features JSONB DEFAULT '{}'
);

-- Seed data
INSERT INTO usage_limits VALUES
  ('free', 50, 10, 104857600, 1, 2, 24, '{"priority_support": false}'),
  ('pro', 500, 100, 5368709120, 1, 4, 6, '{"priority_support": true}'),
  ('team', NULL, NULL, NULL, NULL, NULL, 0, '{"priority_support": true, "sso": true}');
```

### 3.2 Modify `organizations` Table

```sql
ALTER TABLE organizations
ADD COLUMN org_type VARCHAR(20) NOT NULL DEFAULT 'team',  -- 'personal' | 'team'
ADD COLUMN owner_user_id UUID;

CREATE INDEX idx_org_type ON organizations(org_type);
```

### 3.3 Data Migration for Existing Orgs

```sql
-- Create subscriptions for existing organizations (all are team tier)
INSERT INTO subscriptions (organization_id, tier, status)
SELECT id, 'team', 'active'
FROM organizations
WHERE id NOT IN (SELECT organization_id FROM subscriptions);

-- Initialize usage tracking for current period
INSERT INTO usage_tracking (organization_id, period_start, period_end)
SELECT id, DATE_TRUNC('month', NOW())::DATE, (DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 day')::DATE
FROM organizations
WHERE id NOT IN (SELECT organization_id FROM usage_tracking);
```

---

## 4. Files to Create

### 4.1 Migration File
**Path**: `apps/backend/src/db/migrations/0015_add_subscriptions.sql`

Full SQL migration combining all tables and alterations above.

### 4.2 Drizzle Schema
**Path**: `apps/backend/src/db/schema/subscriptions.schema.ts`

```typescript
import { pgTable, uuid, varchar, timestamp, boolean, integer, bigint, date, jsonb, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations.schema.js";

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().unique().references(() => organizations.id, { onDelete: "cascade" }),
  tier: varchar("tier", { length: 20 }).notNull().default("free"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  stripePriceId: varchar("stripe_price_id", { length: 255 }),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  cancelledAt: timestamp("cancelled_at"),
  trialStart: timestamp("trial_start"),
  trialEnd: timestamp("trial_end"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const usageTracking = pgTable("usage_tracking", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  aiQueries: integer("ai_queries").default(0),
  documentsUploaded: integer("documents_uploaded").default(0),
  storageBytesUsed: bigint("storage_bytes_used", { mode: "number" }).default(0),
  integrationSyncs: integer("integration_syncs").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueOrgPeriod: unique().on(table.organizationId, table.periodStart),
}));

export const usageLimits = pgTable("usage_limits", {
  tier: varchar("tier", { length: 20 }).primaryKey(),
  monthlyAiQueries: integer("monthly_ai_queries"),
  maxDocuments: integer("max_documents"),
  maxStorageBytes: bigint("max_storage_bytes", { mode: "number" }),
  maxTeamMembers: integer("max_team_members"),
  maxIntegrations: integer("max_integrations"),
  syncFrequencyHours: integer("sync_frequency_hours"),
  features: jsonb("features").default({}),
});

// Relations
export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id],
  }),
}));

// Types
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type UsageTracking = typeof usageTracking.$inferSelect;
export type UsageLimits = typeof usageLimits.$inferSelect;
export type SubscriptionTier = "free" | "pro" | "team";
export type SubscriptionStatus = "active" | "cancelled" | "past_due" | "trialing";
export type OrgType = "personal" | "team";
```

### 4.3 Subscription Service
**Path**: `apps/backend/src/services/subscription.service.ts`

Core methods:
- `getSubscription(organizationId)` - Get subscription for org
- `getTierLimits(tier)` - Get limits for tier
- `getCurrentUsage(organizationId)` - Get current period usage
- `createSubscription(organizationId, tier)` - Create new subscription
- `incrementUsage(organizationId, metric, amount)` - Track usage (no blocking)
- `getSubscriptionWithUsage(organizationId)` - Get full subscription data

### 4.4 Consumer Signup Page
**Path**: `apps/electron/src/renderer/console/src/pages/auth/SignupConsumerPage.tsx`

Form fields: email, password, firstName, lastName
On submit: POST to /auth/signup-consumer

### 4.5 Usage Meter Component
**Path**: `apps/electron/src/renderer/console/src/components/UsageMeter.tsx`

Shows current usage vs limits in sidebar for consumers (informational only).

---

## 5. Files to Modify

### 5.1 Organizations Schema
**Path**: `apps/backend/src/db/schema/organizations.schema.ts`

Add:
```typescript
orgType: varchar("org_type", { length: 20 }).notNull().default("team"),
ownerUserId: uuid("owner_user_id"),
```

### 5.2 Schema Index
**Path**: `apps/backend/src/db/schema/index.ts`

Add:
```typescript
export * from "./subscriptions.schema";
```

### 5.3 Auth Routes
**Path**: `apps/backend/src/routes/auth.ts`

Add `POST /auth/signup-consumer` endpoint:
1. Create personal organization with `orgType: "personal"`
2. Create Supabase Auth user
3. Update org with `ownerUserId`
4. Create subscription with `tier: "free"`
5. Auto-login and return session

Modify `GET /auth/me` to include:
- `organization.orgType`
- `subscription` object (tier, status)
- `usage` object (aiQueries, documents, storage)
- `limits` object (monthlyAiQueries, maxDocuments, etc.)

### 5.4 Shared Types
**Path**: `packages/shared/src/types.ts`

Add:
```typescript
export type SubscriptionTier = "free" | "pro" | "team";
export type SubscriptionStatus = "active" | "cancelled" | "past_due" | "trialing";
export type OrgType = "personal" | "team";

export interface Subscription {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodEnd?: string;
}

export interface UsageStats {
  aiQueries: number;
  documents: number;
  storage: number;
}

export interface UsageLimits {
  monthlyAiQueries: number | null;
  maxDocuments: number | null;
  maxStorage: number | null;
  maxTeamMembers: number | null;
}

export interface OrganizationInfo {
  id: string;
  name: string;
  orgType: OrgType;
}
```

### 5.5 User Context
**Path**: `apps/electron/src/renderer/console/src/context/UserContext.tsx`

Add state:
- `subscription: Subscription | null`
- `usage: UsageStats | null`
- `limits: UsageLimits | null`

Add computed:
- `isPersonalOrg: boolean` - `organization?.orgType === "personal"`
- `isTeamAdmin: boolean` - `!isPersonalOrg && user?.role === "admin"`

### 5.6 Navigation
**Path**: `apps/electron/src/renderer/console/src/components/navigation/Nav.tsx`

Conditional navigation based on `isPersonalOrg` and `isTeamAdmin`:

**Consumer (personal org):**
- My Roadmap
- Ask AI (Chats)
- Integrations
- Settings

**Team Admin:**
- Dashboard
- People
- Templates
- Integrations

**Team Employee:**
- Roadmap
- Nudges
- Chats

### 5.7 Login Page
**Path**: `apps/electron/src/renderer/console/src/pages/auth/LoginPage.tsx`

Add two signup buttons:
- "Sign up as Individual" → `/signup-consumer`
- "Sign up as Organization" → `/signup-organization`

### 5.8 App Routes
**Path**: `apps/electron/src/renderer/console/src/App.tsx`

Add routes:
- `/signup-consumer` → `SignupConsumerPage`

Update default redirect logic based on `isPersonalOrg`.

---

## 6. Implementation Order

### Step 1: Database & Schema
1. Create `0015_add_subscriptions.sql` migration
2. Create `subscriptions.schema.ts`
3. Modify `organizations.schema.ts`
4. Update `schema/index.ts`
5. Run migration locally

### Step 2: Backend Service
1. Create `subscription.service.ts`
2. Add `POST /auth/signup-consumer` endpoint
3. Update `GET /auth/me` response

### Step 3: Shared Types
1. Add subscription types to `packages/shared/src/types.ts`
2. Build shared package

### Step 4: Frontend Context
1. Update `UserContext.tsx` with subscription state
2. Add `isPersonalOrg` and `isTeamAdmin` computed values

### Step 5: Navigation
1. Update `Nav.tsx` with conditional navigation

### Step 6: Signup Flow
1. Create `SignupConsumerPage.tsx`
2. Update `LoginPage.tsx` with two signup buttons
3. Add route to `App.tsx`

### Step 7: Usage Display
1. Create `UsageMeter.tsx` component
2. Add to consumer navigation sidebar

### Step 8: Testing
1. Test existing team user flow (no breaking changes)
2. Test new consumer signup flow
3. Test navigation switching

---

## 7. API Changes Summary

### New Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/signup-consumer` | Create individual account with personal org |

### Modified Endpoints
| Method | Path | Changes |
|--------|------|---------|
| GET | `/auth/me` | Add `organization.orgType`, `subscription`, `usage`, `limits` |

### New Response Fields in `/auth/me`
```json
{
  "user": { ... },
  "organization": {
    "id": "uuid",
    "name": "John's Workspace",
    "orgType": "personal"
  },
  "subscription": {
    "tier": "free",
    "status": "active",
    "currentPeriodEnd": "2025-01-31T23:59:59Z"
  },
  "usage": {
    "aiQueries": 12,
    "documents": 3,
    "storage": 5242880
  },
  "limits": {
    "monthlyAiQueries": 50,
    "maxDocuments": 10,
    "maxStorage": 104857600,
    "maxTeamMembers": 1
  }
}
```

---

## 8. UI Changes Summary

### Login Page
Before: Single "Sign up" link
After: Two buttons - "Sign up as Individual" and "Sign up as Organization"

### Navigation (Consumer - Personal Org)
```
My Roadmap
Ask AI
Integrations
Settings
─────────────
[Usage Meter]
  AI Queries: 12/50
  Documents: 3/10
  Storage: 5MB/100MB
```

### Navigation (Team Admin)
```
Dashboard
People
Templates
Integrations
```

### Navigation (Team Employee)
```
Roadmap
Nudges
Chats
```

---

## 9. Testing Checklist

- [ ] Existing team admin can still login and access all features
- [ ] Existing team employee can still login and access their features
- [ ] New consumer can sign up and gets personal organization
- [ ] Consumer sees simplified navigation
- [ ] Consumer can create roadmap tasks
- [ ] Consumer can use chat/AI features
- [ ] Consumer can manage integrations
- [ ] Usage stats display correctly (no blocking)
- [ ] Team admin sees full admin navigation
- [ ] Team employee sees employee navigation

---

## 10. Rollback Plan

If issues arise, run this SQL to revert:

```sql
-- Drop new tables
DROP TABLE IF EXISTS usage_tracking;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS usage_limits;

-- Remove new columns from organizations
ALTER TABLE organizations DROP COLUMN IF EXISTS org_type;
ALTER TABLE organizations DROP COLUMN IF EXISTS owner_user_id;
```

And revert code changes via git.

---

## 11. Future Enhancements (Deferred)

### Phase A: Usage Enforcement
- Create `usage-limit.ts` middleware
- Block requests when limits exceeded
- Show upgrade prompts

### Phase B: Stripe Integration
- Checkout session creation
- Webhook handlers for subscription events
- Billing portal

### Phase C: Team Features
- Convert personal org to team
- Invite team members
- Role management
