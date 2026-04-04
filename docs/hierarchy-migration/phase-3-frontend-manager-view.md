# Phase 3: Frontend Manager View

## Goal

Give managers a dedicated view in the Electron console app where they can see their reports' activity, performance, and benchmarks. Replace the binary admin/employee toggle with a three-way view switcher.

**Depends on:** Phase 2 (backend returns scoped data for managers)

---

## UI Mockups

### View Switcher (Sidebar Component)

Segmented control sits at the top of the sidebar, below the logo. Only shows modes available to the current user.

```
 ┌─── Sidebar (dark bg: #1a1a2e) ──────────────┐
 │                                               │
 │   ◆ mitable                                  │
 │                                               │
 │  ┌─────────────────────────────────────────┐  │
 │  │ ┌──────────┐┌───────────┐┌──────────┐  │  │
 │  │ │ My View  ││ Team View ││ Org View │  │  │
 │  │ └──────────┘└───────────┘└──────────┘  │  │
 │  └─────────────────────────────────────────┘  │
 │        ↑ active = white bg, dark text         │
 │        ↑ inactive = transparent, gray text    │
 │                                               │
 │  ── Navigation ─────────────────────────────  │
 │   (changes based on active view mode)         │
 │                                               │
 └───────────────────────────────────────────────┘
```

**Variations by user type:**

```
 Admin + Manager:     [ My View ] [ Team View ] [ Org View ]
 Admin (no reports):  [ My View ] [ Org View ]
 Manager (non-admin): [ My View ] [ Team View ]
 Employee:            (no switcher shown)
```

---

### Employee — "My View"

Personal productivity. This is the default landing for employees.

```
 ┌─── Sidebar ──────────┬─── Main Content ──────────────────────────────────────┐
 │                       │                                                       │
 │  ◆ mitable            │  Calendar                                  Apr 2026   │
 │                       │                                                       │
 │  ▸ No view switcher   │  ┌─── Mon 6 ──┬─── Tue 7 ──┬─── Wed 8 ──┬─── Thu 9 │
 │                       │  │             │             │             │           │
 │  ── NAV ────────────  │  │  9:00       │  9:00       │  9:30       │  9:00     │
 │                       │  │  VS Code    │  Figma      │  VS Code    │  Slack    │
 │  📅  Calendar    ←    │  │  2h 15m     │  1h 40m     │  3h 05m     │  45m      │
 │  👤  Me               │  │             │             │             │           │
 │  🤖  Agent            │  │  11:30      │  11:00      │  1:00       │  10:00    │
 │  🎯  Benchmarks       │  │  Slack      │  Zoom       │  Notion     │  VS Code  │
 │  📄  Docs             │  │  35m        │  55m        │  40m        │  2h 30m   │
 │  📤  Uploads          │  │             │             │             │           │
 │                       │  │  2:00       │  2:00       │  3:00       │  2:00     │
 │                       │  │  Chrome     │  VS Code    │  Terminal   │  Zoom     │
 │                       │  │  1h 10m     │  2h 20m     │  1h 15m     │  1h 00m   │
 │                       │  │             │             │             │           │
 │                       │  └─────────────┴─────────────┴─────────────┴───────── │
 │                       │                                                       │
 │  ── ACCOUNT ────────  │  Today: 6h 42m active   │   Top app: VS Code (3h 5m) │
 │  Sarah Chen           │                                                       │
 │  Engineer             │                                                       │
 └───────────────────────┴───────────────────────────────────────────────────────┘
```

---

### Manager — "Team View"

Team oversight. Dashboard and people scoped to the manager's direct + transitive reports.

```
 ┌─── Sidebar ──────────┬─── Main Content ──────────────────────────────────────┐
 │                       │                                                       │
 │  ◆ mitable            │  Team Dashboard                          This Week ▾  │
 │                       │                                                       │
 │  ┌─────────────────┐  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │
 │  │[My ][Team][    ]│  │  │  4 reports   │ │  28h 15m    │ │  85%        │     │
 │  └─────────────────┘  │  │  active      │ │  total time │ │  benchmark  │     │
 │       ↑ active         │  └─────────────┘ └─────────────┘ └─────────────┘     │
 │                       │                                                       │
 │  ── NAV ────────────  │  ── My Reports ─────────────────────────────────────  │
 │                       │                                                       │
 │  📊  Team Dashboard ← │  │ Name          │ Active Today │ Top App    │ Bench │
 │  👥  My Reports       │  ├───────────────┼──────────────┼────────────┼───────│
 │  🎯  Benchmarks       │  │ ●  Alex Kim   │ 5h 32m       │ VS Code    │ 72%   │
 │  📈  Reports          │  │ ●  Jordan Lee │ 4h 18m       │ Figma      │ 88%   │
 │  ─────────────────    │  │ ○  Sam Patel  │ —            │ —          │ 65%   │
 │  📅  Calendar         │  │ ●  Mia Wong   │ 6h 05m       │ Chrome     │ 91%   │
 │  👤  Me               │  │                                                   │
 │  🤖  Agent            │  ● = active now   ○ = not active                      │
 │                       │                                                       │
 │                       │  ── Activity Trend ─────────────────────────────────  │
 │                       │                                                       │
 │                       │  Mon  ████████████████████  32h                       │
 │  ── ACCOUNT ────────  │  Tue  ██████████████████    28h                       │
 │  David Park           │  Wed  ████████████████████████  36h                   │
 │  Engineering Lead     │  Thu  ██████████████        22h (today)               │
 │                       │                                                       │
 └───────────────────────┴───────────────────────────────────────────────────────┘
```

---

### Admin — "Org View"

Configuration and org-wide analytics. No personal features (calendar, me) — switch to My View for those.

```
 ┌─── Sidebar ──────────┬─── Main Content ──────────────────────────────────────┐
 │                       │                                                       │
 │  ◆ mitable            │  Organization Dashboard                  This Week ▾  │
 │                       │                                                       │
 │  ┌─────────────────┐  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │
 │  │[My ][Team][ Org]│  │  │  24 people   │ │  186h total │ │  78% avg    │     │
 │  └─────────────────┘  │  │  in org      │ │  active     │ │  benchmark  │     │
 │       ↑ active         │  └─────────────┘ └─────────────┘ └─────────────┘     │
 │                       │                                                       │
 │  ── NAV ────────────  │  ── Departments ────────────────────────────────────  │
 │                       │                                                       │
 │  📊  Org Dashboard ←  │  │ Department    │ People │ Avg Active │ Benchmark │  │
 │  👥  People           │  ├───────────────┼────────┼────────────┼───────────│  │
 │  🎯  Benchmarks       │  │ Engineering   │ 12     │ 6h 22m     │ 82%       │  │
 │  📈  Reports          │  │ Design        │ 4      │ 5h 48m     │ 76%       │  │
 │  🗂️  Org Chart        │  │ Sales         │ 5      │ 4h 15m     │ 71%       │  │
 │  👥  Teams            │  │ Operations    │ 3      │ 5h 30m     │ 85%       │  │
 │  🤖  Agent            │  │                                                   │
 │                       │  ── Top Apps (Org-wide) ────────────────────────────  │
 │                       │                                                       │
 │                       │  VS Code    ████████████████████████  42%             │
 │                       │  Chrome     ██████████████            24%             │
 │  ── ACCOUNT ────────  │  Slack      ████████████              18%             │
 │  Emily Torres         │  Figma      ██████                    10%             │
 │  Admin                │  Other      ████                       6%             │
 │                       │                                                       │
 └───────────────────────┴───────────────────────────────────────────────────────┘
```

---

## 1. Type Updates

### 1.1 Electron renderer types

**File:** `apps/electron/src/renderer/console/src/types/index.ts`

```typescript
export type UserRole = "admin" | "employee";  // UNCHANGED — manager is NOT a role

export interface User {
  id: string;
  name: string;
  firstName: string;
  email?: string;
  avatarUrl?: string;
  currentWeek: number;
  role: UserRole;
  originalRole?: UserRole;
  organizationId: string;
  // NEW hierarchy fields
  isManager?: boolean;
  managerId?: string | null;
  teamId?: string | null;
  department?: string | null;
  directReportCount?: number;
}
```

**Key:** `UserRole` stays `"admin" | "employee"`. The `isManager` boolean is a computed property from having direct reports, not a role.

### 1.2 View mode type

Add a new type for the three-way view:

```typescript
export type ViewMode = "employee" | "manager" | "admin";
```

---

## 2. UserContext Updates

**File:** `apps/electron/src/renderer/console/src/context/UserContext.tsx`

### 2.1 Extend context with hierarchy fields

The `/auth/me` response now includes `isManager`, `managerId`, `teamId`, `department`. Map these into the User object.

### 2.2 View mode logic

Replace the binary `role` / `originalRole` switching with a `viewMode` state:

```typescript
interface UserContextValue {
  user: User | null;
  viewMode: ViewMode;           // NEW: current active view
  availableViewModes: ViewMode[]; // NEW: what views this user can access
  setViewMode: (mode: ViewMode) => void;  // NEW
  // ... existing methods
}
```

**Available modes logic:**

```typescript
function getAvailableViewModes(user: User): ViewMode[] {
  const modes: ViewMode[] = ["employee"]; // Everyone gets employee view
  if (user.isManager) modes.push("manager");
  if (user.role === "admin" || user.originalRole === "admin") modes.push("admin");
  return modes;
}
```

**Persistence:** Store last-used view mode in `localStorage.mitable:viewMode` (replaces `localStorage.mitable:lastMode`).

### 2.3 Backward compatibility

- If `isManager` is undefined (old backend), treat as `false`
- If `localStorage.mitable:lastMode` exists (old key), migrate to `localStorage.mitable:viewMode`
- If stored viewMode is "manager" but user is no longer a manager (reports reassigned), fall back to "employee"

---

## 3. Sidebar View Switcher

**File:** `apps/electron/src/renderer/console/src/components/layout/Sidebar.tsx`

### 3.1 Replace binary toggle with view mode selector

**Current behavior (lines 14-29):** A single button that toggles between "Switch to IC View" and "Switch to Admin View" for admins.

**New behavior:** A segmented control or dropdown showing available view modes:

```
┌─────────────────────────────┐
│  [Employee] [Manager] [Admin] │  ← only visible modes shown
└─────────────────────────────┘
```

For a manager who is NOT an admin, they see: `[Employee] [Manager]`
For an admin who is also a manager: `[Employee] [Manager] [Admin]`
For an admin with no reports: `[Employee] [Admin]`
For a regular employee: no switcher shown

### 3.2 Implementation

```tsx
function ViewModeSwitcher() {
  const { viewMode, availableViewModes, setViewMode } = useUser();

  if (availableViewModes.length <= 1) return null;

  return (
    <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
      {availableViewModes.map((mode) => (
        <button
          key={mode}
          onClick={() => setViewMode(mode)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            viewMode === mode
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          {mode === "employee" ? "My View" : mode === "manager" ? "Team View" : "Org View"}
        </button>
      ))}
    </div>
  );
}
```

**Labels:**
- `employee` → "My View" (personal data)
- `manager` → "Team View" (reports' data)
- `admin` → "Org View" (org-wide data)

---

## 4. Navigation Routes

**File:** `apps/electron/src/renderer/console/src/components/navigation/Nav.tsx`

### 4.1 Three-tier navigation

| Route | Employee (My View) | Manager (Team View) | Admin (Org View) |
|-------|-------------------|--------------------|--------------------|
| `/calendar` | yes | yes | — |
| `/me` | yes | yes | — |
| `/agent` | yes | yes | yes |
| `/docs` | yes | — | — |
| `/uploads` | yes | — | — |
| `/dashboard` | — | yes (scoped) | yes (org-wide) |
| `/people` | — | yes (reports only) | yes (all) |
| `/benchmarks` | yes (view only) | yes (full CRUD, scoped) | yes (full CRUD, org-wide) |
| `/benchmarks/new` | — | yes | yes |
| `/benchmarks/:id/edit` | — | yes | yes |
| `/reports` | — | yes (scoped to reports) | yes (org-wide) |
| `/org-chart` | — | — | yes |
| `/teams` | — | — | yes |

**Design rationale:**
- **Admin (Org View)** is configuration-focused — no `/calendar`, `/me`. Admins switch to My View for personal features.
- **Manager (Team View)** gets full benchmark CRUD and reports, scoped to their reports.
- **Employee (My View)** is personal productivity only.

### 4.2 Implementation

Replace the current `isAdminView` boolean with `viewMode`:

```tsx
interface NavProps {
  viewMode: ViewMode;
}

function Nav({ viewMode }: NavProps) {
  const employeeRoutes = [
    { path: "/calendar", label: "Calendar", icon: CalendarIcon },
    { path: "/me", label: "Me", icon: UserIcon },
    { path: "/agent", label: "Agent", icon: BotIcon },
    { path: "/benchmarks", label: "Benchmarks", icon: TargetIcon },
    { path: "/docs", label: "Docs", icon: FileIcon },
    { path: "/uploads", label: "Uploads", icon: UploadIcon },
  ];

  const managerRoutes = [
    { path: "/dashboard", label: "Team Dashboard", icon: LayoutIcon },
    { path: "/people", label: "My Reports", icon: UsersIcon },
    { path: "/benchmarks", label: "Benchmarks", icon: TargetIcon },
    { path: "/reports", label: "Reports", icon: ChartIcon },
    { path: "/calendar", label: "Calendar", icon: CalendarIcon },
    { path: "/me", label: "Me", icon: UserIcon },
    { path: "/agent", label: "Agent", icon: BotIcon },
  ];

  const adminRoutes = [
    { path: "/dashboard", label: "Org Dashboard", icon: LayoutIcon },
    { path: "/people", label: "People", icon: UsersIcon },
    { path: "/benchmarks", label: "Benchmarks", icon: TargetIcon },
    { path: "/reports", label: "Reports", icon: ChartIcon },
    { path: "/org-chart", label: "Org Chart", icon: NetworkIcon },
    { path: "/teams", label: "Teams", icon: FolderIcon },
    { path: "/agent", label: "Agent", icon: BotIcon },
  ];

  const routes = viewMode === "admin" ? adminRoutes
    : viewMode === "manager" ? managerRoutes
    : employeeRoutes;

  return (/* render routes */);
}
```

---

## 5. Route Protection

**File:** `apps/electron/src/renderer/console/src/App.tsx`

### 5.1 Replace `AdminOnlyRoute` with `ProtectedRoute`

**Current** (line 245):
```typescript
function AdminOnlyRoute({ children }) {
  const { user } = useUser();
  if (user?.role !== "admin") return <Navigate to="/benchmarks" replace />;
  return <>{children}</>;
}
```

**Replace with:**
```typescript
interface ProtectedRouteProps {
  requireAdmin?: boolean;
  requireManager?: boolean;  // manager OR admin
  children: React.ReactNode;
}

function ProtectedRoute({ requireAdmin, requireManager, children }: ProtectedRouteProps) {
  const { user } = useUser();

  if (requireAdmin && user?.role !== "admin") {
    return <Navigate to="/calendar" replace />;
  }

  if (requireManager && user?.role !== "admin" && !user?.isManager) {
    return <Navigate to="/calendar" replace />;
  }

  return <>{children}</>;
}
```

### 5.2 Route definitions

```tsx
<Route path="/dashboard" element={
  <ProtectedRoute requireManager>
    <DashboardPage />
  </ProtectedRoute>
} />

<Route path="/people" element={
  <ProtectedRoute requireManager>
    <PeoplePage />
  </ProtectedRoute>
} />

<Route path="/benchmarks/new" element={
  <ProtectedRoute requireManager>
    <CreateBenchmarkPage />
  </ProtectedRoute>
} />

<Route path="/benchmarks/:id/edit" element={
  <ProtectedRoute requireManager>
    <EditBenchmarkPage />
  </ProtectedRoute>

<Route path="/reports" element={
  <ProtectedRoute requireManager>
    <ReportsPage />
  </ProtectedRoute>
} />
```

### 5.3 Default redirect on login

**Current:** Admin → `/dashboard`, non-admin → `/benchmarks`

**New:**
```typescript
if (user.role === "admin") navigate("/dashboard");
else if (user.isManager) navigate("/dashboard");  // managers go to team dashboard
else navigate("/calendar");
```

---

## 6. Management Context

**File:** `apps/electron/src/renderer/console/src/context/AdminContext.tsx`

### 6.1 Rename to ManagementContext

Rename file to `ManagementContext.tsx`. Update all imports across the app.

### 6.2 Activate for managers

**Current activation condition:**
```typescript
const isEnabled = user?.role === "admin";
```

**New:**
```typescript
const isEnabled = user?.role === "admin" || user?.isManager;
```

The backend handles scoping — the frontend queries the same endpoints regardless of whether the user is admin or manager. The backend returns only the data the user is authorized to see.

### 6.3 Provide view context

Add `viewMode` to the context so dashboard components know whether to show "Org" or "Team" labels:

```typescript
interface ManagementContextValue {
  viewMode: ViewMode;
  users: User[];         // visible users (all org for admin, reports for manager)
  integrations: Integration[];  // admin only
  templates: Template[];        // admin only
  // ...
}
```

Conditionally fetch integration and template data only for admins:

```typescript
const { data: integrations } = useQuery({
  queryKey: ["integrations"],
  queryFn: fetchIntegrations,
  enabled: user?.role === "admin",  // managers don't need this
});
```

---

## 6.4 View-mode-aware data fetching

**Critical pattern**: React Query hooks that serve both admin and manager views must:

1. **Enable for managers**: `enabled: user.role === "admin" || user.isManager`
2. **Include `viewMode` in query key**: So data refetches when switching views
3. **Let the backend scope**: The backend uses `getCachedVisibleUserIds(req)` to return
   only the users the actor can see — admins get all, managers get their reports

**Example — `useUsers` hook:**

```typescript
export function useUsers() {
  const { user, viewMode } = useUser();
  return useQuery({
    queryKey: ["admin", "users", viewMode],
    queryFn: fetchUsers,
    enabled: !!user && (user.role === "admin" || !!user.isManager),
  });
}
```

**Backend scoping pattern (`GET /admin/users`):**

```typescript
router.get("/users", requireAuth, requireManagerOrAdmin, async (req, res) => {
  const visibleUserIds = await getCachedVisibleUserIds(req);
  const users = await db.select(...).from(users).where(inArray(users.id, visibleUserIds));
  // ...
});
```

This pattern replaces the old inline `role !== "admin"` checks. Apply it to any
endpoint that serves data in both admin and manager views.

---

## 7. Dashboard Components

### 7.1 Dashboard header

Show context-appropriate header:

```tsx
<h1>{viewMode === "admin" ? "Organization Dashboard" : "Team Dashboard"}</h1>
<p className="text-gray-500">
  {viewMode === "admin"
    ? `${totalUsers} people in your organization`
    : `${totalUsers} people on your team`}
</p>
```

### 7.2 People list

The people list page shows the same component but with different data (backend handles scoping). Add a subtle indicator showing the scope:

- Admin: "All People" header
- Manager: "My Reports" header, with option to expand to see reports' reports

### 7.3 No new pages needed

The existing dashboard and people pages work for managers — the backend returns scoped data. The UI just needs different labels and the view switcher.

---

## 8. React Query Key Updates

Update query keys to include `viewMode` so data refetches when switching views:

```typescript
// Before
queryKey: ["dashboard", "people"]

// After
queryKey: ["dashboard", "people", viewMode]
```

This ensures an admin switching between "Team View" and "Org View" sees correctly scoped data without stale cache.

---

## Verification Checklist

- [ ] Regular employee: sees "My View" only, no view switcher, no dashboard route
- [ ] Manager (non-admin): sees "My View" and "Team View" switcher
- [ ] Manager team dashboard: shows only their reports' metrics
- [ ] Manager people page: shows only their direct + transitive reports
- [ ] Admin: sees all three views, can switch between them
- [ ] Admin "Team View": if admin has reports, shows only their reports
- [ ] Admin "Org View": shows all org data (unchanged from today)
- [ ] View mode persists across app restarts via localStorage
- [ ] Navigating to `/dashboard` as employee redirects to `/calendar`
- [ ] React Query refetches data when view mode changes
- [ ] `npm run typecheck --workspace=apps/electron` passes

---

## Files Modified/Created

| Action | File |
|--------|------|
| MODIFY | `apps/electron/src/renderer/console/src/types/index.ts` |
| MODIFY | `apps/electron/src/renderer/console/src/context/UserContext.tsx` |
| MODIFY | `apps/electron/src/renderer/console/src/components/layout/Sidebar.tsx` |
| MODIFY | `apps/electron/src/renderer/console/src/components/navigation/Nav.tsx` |
| MODIFY | `apps/electron/src/renderer/console/src/App.tsx` |
| RENAME | `AdminContext.tsx` → `ManagementContext.tsx` |
| MODIFY | All files importing AdminContext (update imports) |
| MODIFY | Dashboard page components (labels, headers) |
| MODIFY | People list components (scoping labels) |
