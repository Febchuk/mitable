# Phase 4: Team Management UI

## Goal

Give admins a visual interface to manage the organizational hierarchy — assign managers, create teams, and view the org chart. This is the final phase that makes hierarchy management self-service instead of API-only.

**Depends on:** Phase 3 (frontend manager view must be working)

---

## 1. New API Endpoints

### 1.1 Teams CRUD

**File:** `apps/backend/src/routes/admin.ts` (or new `teams.ts` route file)

All team endpoints are admin-only.

```
POST   /admin/teams          — Create a team
GET    /admin/teams          — List all teams in org
GET    /admin/teams/:id      — Get team with members
PATCH  /admin/teams/:id      — Update team name/description/leader
DELETE /admin/teams/:id      — Delete team (members become unassigned)
PUT    /admin/teams/:id/parent — Set parent team (for nested teams)
```

**Create team request:**
```json
{
  "name": "Engineering",
  "description": "Product engineering team",
  "leaderId": "user-uuid",          // optional
  "parentTeamId": "team-uuid"       // optional, for nesting
}
```

**Validation:**
- Team name unique within organization
- Leader must be in same organization
- Parent team must be in same organization
- No circular parent references

### 1.2 Team member management

```
PUT    /admin/users/:id/team    — Assign user to team
DELETE /admin/users/:id/team    — Remove user from team
```

### 1.3 Bulk hierarchy operations

```
POST /admin/hierarchy/bulk-assign — Assign managers to multiple users at once
```

Request:
```json
{
  "assignments": [
    { "userId": "user-1", "managerId": "manager-1" },
    { "userId": "user-2", "managerId": "manager-1" },
    { "userId": "user-3", "managerId": "manager-2" }
  ]
}
```

Validates all assignments in a transaction (all succeed or all fail). Checks for cycles across the entire batch.

---

## 2. Org Chart Page

### 2.1 New page component

**New file:** `apps/electron/src/renderer/console/src/pages/OrgChartPage.tsx`

Admin-only page accessible from "Org View" navigation.

### 2.2 Layout

```
┌──────────────────────────────────────────────────────┐
│  Organization Chart                    [List] [Tree]  │
├──────────────────────────────────────────────────────┤
│                                                       │
│              ┌──────────┐                             │
│              │   CEO     │                             │
│              │  (Admin)  │                             │
│              └────┬─────┘                             │
│         ┌─────────┼─────────┐                         │
│    ┌────┴────┐  ┌────┴────┐  ┌────┴────┐              │
│    │VP Eng   │  │VP Sales │  │VP Ops   │              │
│    └────┬────┘  └────┬────┘  └─────────┘              │
│    ┌────┴────┐  ┌────┴────┐                           │
│    │Lead FE  │  │AE Team  │                           │
│    │Lead BE  │  └─────────┘                           │
│    └─────────┘                                        │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### 2.3 Two view modes

**Tree view:** Visual hierarchy (default). Each node shows:
- Avatar + name
- Job title
- Team name (if assigned)
- Number of direct reports
- Click to expand/collapse subtree

**List view:** Table format for bulk operations. Columns:
- Name
- Role
- Manager (dropdown to change)
- Team (dropdown to change)
- Department (editable)
- Direct reports count

### 2.4 Implementation approach

Use a simple recursive React component for the tree — no need for a heavy graph library:

```tsx
interface OrgNodeProps {
  user: UserWithReports;
  depth: number;
  onAssignManager: (userId: string, managerId: string | null) => void;
}

function OrgNode({ user, depth, onAssignManager }: OrgNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);

  return (
    <div style={{ marginLeft: depth * 48 }}>
      <div className="flex items-center gap-3 rounded-lg p-3 hover:bg-gray-50">
        <Avatar src={user.avatarUrl} name={user.name} size="sm" />
        <div>
          <p className="font-medium">{user.name}</p>
          <p className="text-xs text-gray-500">{user.jobTitle}</p>
        </div>
        {user.directReports.length > 0 && (
          <button onClick={() => setExpanded(!expanded)}>
            {expanded ? "▼" : "▶"} {user.directReports.length}
          </button>
        )}
      </div>
      {expanded && user.directReports.map((report) => (
        <OrgNode
          key={report.id}
          user={report}
          depth={depth + 1}
          onAssignManager={onAssignManager}
        />
      ))}
    </div>
  );
}
```

### 2.5 Drag-and-drop reassignment (stretch goal)

Allow dragging a person node onto another person to set them as their manager. Use `@dnd-kit/core` (already lightweight):

1. Drag a person card
2. Drop onto another person
3. Confirm dialog: "Make [target] the manager of [dragged]?"
4. Call `PUT /admin/users/:id/manager`
5. Refetch org tree

This is a nice-to-have for Phase 4 and can be added later without architectural changes.

---

## 3. Manager Assignment in User Edit

### 3.1 Existing user detail/edit form

**File:** `apps/electron/src/renderer/console/src/pages/` (wherever user profile editing lives)

Add a "Manager" field to the existing user edit form:

```tsx
<FormField label="Reports To">
  <UserSelect
    value={user.managerId}
    onChange={(managerId) => updateUser({ managerId })}
    users={orgUsers.filter((u) => u.id !== user.id)} // exclude self
    placeholder="No manager (top-level)"
    allowClear
  />
</FormField>
```

### 3.2 UserSelect component

**New component:** Searchable dropdown for selecting a user. Shows avatar + name + job title. Used for both manager and team leader selection.

```tsx
interface UserSelectProps {
  value: string | null;
  onChange: (userId: string | null) => void;
  users: User[];
  placeholder?: string;
  allowClear?: boolean;
}
```

---

## 4. Team Management UI

### 4.1 Teams page

**New file:** `apps/electron/src/renderer/console/src/pages/TeamsPage.tsx`

Admin-only page showing all teams in the organization.

```
┌──────────────────────────────────────────────────────┐
│  Teams                                  [+ New Team]  │
├──────────────────────────────────────────────────────┤
│                                                       │
│  ┌────────────────────────────────────────────────┐   │
│  │ Engineering                        8 members   │   │
│  │ Lead: Jane Smith                               │   │
│  │ Sub-teams: Frontend, Backend, DevOps           │   │
│  └────────────────────────────────────────────────┘   │
│                                                       │
│  ┌────────────────────────────────────────────────┐   │
│  │ Sales                              5 members   │   │
│  │ Lead: John Doe                                 │   │
│  └────────────────────────────────────────────────┘   │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### 4.2 Team detail panel

Clicking a team opens a detail panel:
- Edit team name, description
- Assign/change team leader (UserSelect)
- Set parent team (for nesting)
- View/manage members (add/remove users)

### 4.3 Create team dialog

Simple modal form:
- Team name (required)
- Description (optional)
- Team leader (optional, UserSelect)
- Parent team (optional, dropdown of existing teams)

---

## 5. Department Field

### 5.1 Add to user edit form

The `department` field already exists in shared types but is unused. Activate it:

```tsx
<FormField label="Department">
  <DepartmentInput
    value={user.department}
    onChange={(dept) => updateUser({ department: dept })}
    suggestions={existingDepartments} // autocomplete from existing values in org
  />
</FormField>
```

### 5.2 DepartmentInput component

Combobox that shows existing department names in the org as suggestions, but allows typing a new one. This keeps departments flexible (no separate department table) while encouraging consistency.

---

## 6. People Page Enhancements

### 6.1 Add hierarchy columns

**File:** People list page component

Add columns to the existing people table:
- **Manager**: shows manager name, click to navigate to manager's profile
- **Team**: shows team name with colored badge
- **Department**: text field

### 6.2 Filter/group by

Add grouping options to the people list:
- Group by: Manager | Team | Department | None
- Filter by: Team dropdown, Department dropdown

### 6.3 Bulk actions

Select multiple users and:
- Assign to same manager
- Assign to same team
- Set same department

Uses the `POST /admin/hierarchy/bulk-assign` endpoint.

---

## 7. Navigation Updates

### 7.1 Add Org Chart to admin nav

**File:** `Nav.tsx`

Add to admin routes:
```typescript
{ path: "/org-chart", label: "Org Chart", icon: NetworkIcon }
```

### 7.2 Add Teams to admin nav

```typescript
{ path: "/teams", label: "Teams", icon: UsersIcon }
```

### 7.3 Route definitions

**File:** `App.tsx`

```tsx
<Route path="/org-chart" element={
  <ProtectedRoute requireAdmin>
    <OrgChartPage />
  </ProtectedRoute>
} />

<Route path="/teams" element={
  <ProtectedRoute requireAdmin>
    <TeamsPage />
  </ProtectedRoute>
} />
```

---

## 8. React Query Hooks

### 8.1 New hooks

**New file:** `apps/electron/src/renderer/console/src/hooks/queries/admin/useOrgTree.ts`

```typescript
export function useOrgTree() {
  return useQuery({
    queryKey: ["org-tree"],
    queryFn: () => api.get("/admin/org-tree").then((r) => r.data),
  });
}
```

**New file:** `apps/electron/src/renderer/console/src/hooks/queries/admin/useTeams.ts`

```typescript
export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get("/admin/teams").then((r) => r.data),
  });
}
```

### 8.2 Mutations

```typescript
export function useAssignManager() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, managerId }: { userId: string; managerId: string | null }) =>
      api.put(`/admin/users/${userId}/manager`, { managerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-tree"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "people"] });
    },
  });
}

export function useCreateTeam() { /* ... */ }
export function useUpdateTeam() { /* ... */ }
export function useDeleteTeam() { /* ... */ }
export function useAssignTeam() { /* ... */ }
export function useBulkAssignManagers() { /* ... */ }
```

---

## Verification Checklist

- [ ] Admin can view org chart (tree and list views)
- [ ] Admin can assign a manager to a user via org chart
- [ ] Admin can assign a manager via user edit form
- [ ] Circular manager assignment is rejected with clear error
- [ ] Admin can create, edit, delete teams
- [ ] Admin can assign users to teams
- [ ] Admin can set team leaders
- [ ] Nested teams display correctly
- [ ] Bulk manager assignment works (select multiple, assign)
- [ ] Department field autocompletes from existing values
- [ ] People page shows manager, team, department columns
- [ ] People page grouping/filtering by team and department works
- [ ] Non-admin users cannot access org chart or teams pages
- [ ] `npm run typecheck --workspace=apps/electron` passes

---

## Files Modified/Created

| Action | File |
|--------|------|
| MODIFY | `apps/backend/src/routes/admin.ts` (team endpoints) |
| CREATE | `apps/electron/.../pages/OrgChartPage.tsx` |
| CREATE | `apps/electron/.../pages/TeamsPage.tsx` |
| CREATE | `apps/electron/.../components/UserSelect.tsx` |
| CREATE | `apps/electron/.../components/DepartmentInput.tsx` |
| CREATE | `apps/electron/.../hooks/queries/admin/useOrgTree.ts` |
| CREATE | `apps/electron/.../hooks/queries/admin/useTeams.ts` |
| MODIFY | `apps/electron/.../components/navigation/Nav.tsx` (add routes) |
| MODIFY | `apps/electron/.../App.tsx` (add route definitions) |
| MODIFY | People page component (add columns, filters, bulk actions) |
| MODIFY | User edit form component (add manager, team, department fields) |
