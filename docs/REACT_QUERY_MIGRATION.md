# TanStack Query Migration Plan

## Overview

Migrate from manual React Context state management to TanStack Query (React Query) for all server data fetching. This will provide automatic caching, background refetching, optimistic updates, and better developer experience.

**Current State:** 4 contexts with manual fetch logic (AdminContext, RoadmapContext, NudgesContext, ChatsContext)

**Target State:** UserContext only + React Query hooks for all server data

**Estimated Time:** 1.5-2 hours

---

## Why React Query?

### Current Pain Points
- ✗ Stale data after navigation (users don't see newly created items)
- ✗ Manual cache invalidation is error-prone
- ✗ Duplicate API calls when multiple components need same data
- ✗ Manual loading/error state management (~30 lines per fetch)
- ✗ Multi-user scenarios show stale data

### React Query Benefits
- ✅ Auto-refetch on window focus - users always see fresh data
- ✅ Auto-refetch on network reconnect - handles offline scenarios
- ✅ Request deduplication - multiple components requesting same data = 1 API call
- ✅ Built-in loading/error states - no manual state management
- ✅ Optimistic updates - instant UI updates with auto-rollback
- ✅ Cache invalidation - one line: `invalidateQueries(['users'])`
- ✅ DevTools - debug cache, queries, mutations visually
- ✅ Background refetching - keep data fresh based on staleTime

---

## Architecture Decision

**React Query** = Server state (data from APIs)
**React Context** = Client state (UI state, auth, preferences)

### After Migration

```tsx
<QueryClientProvider client={queryClient}>
  <UserProvider>  {/* Auth/session only */}
    <Routes>
      {/* Components use React Query hooks directly */}
    </Routes>
  </UserProvider>
</QueryClientProvider>
```

Components will use:
```tsx
// Instead of useAdmin().users
const { data: users } = useUsers();

// Instead of useRoadmap().weeks
const { data: roadmap } = useRoadmapQuery();

// Auth still uses context
const { user, logout } = useUser();
```

---

## Phase 1: Installation & Core Setup (10 min)

### 1.1 Install Dependencies

```bash
cd apps/electron
npm install @tanstack/react-query
npm install @tanstack/react-query-devtools --save-dev
```

### 1.2 Create Query Client Configuration

**New file: `apps/electron/src/renderer/console/src/lib/queryClient.ts`**

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds - data considered fresh
      gcTime: 5 * 60 * 1000, // 5 minutes - cache time (formerly cacheTime)
      retry: 1, // Retry failed requests once
      refetchOnWindowFocus: true, // Refetch when user returns to tab
      refetchOnReconnect: true, // Refetch when network reconnects
    },
    mutations: {
      retry: 0, // Don't retry mutations
    },
  },
});
```

### 1.3 Setup QueryClientProvider in App.tsx

**File: `apps/electron/src/renderer/console/src/App.tsx`**

Add imports:
```typescript
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './lib/queryClient';
```

Wrap HashRouter with QueryClientProvider (outermost provider):
```typescript
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <UserProvider>
          {/* Other providers - will be removed/simplified later */}
          <AdminProvider>
            <RoadmapProvider>
              <NudgesProvider>
                <ChatsProvider>
                  <Routes>...</Routes>
                  <Toaster />
                </ChatsProvider>
              </NudgesProvider>
            </RoadmapProvider>
          </AdminProvider>
        </UserProvider>
      </HashRouter>
      {/* DevTools - only in development */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

---

## Phase 2: Create Query Hooks Directory Structure (5 min)

### 2.1 Create Hooks Directory

**New directory structure:**
```
apps/electron/src/renderer/console/src/hooks/queries/
├── admin/
│   ├── useUsers.ts
│   ├── useTemplates.ts
│   ├── useIntegrations.ts
│   ├── useUserDetail.ts
│   ├── useCreateUser.ts
│   └── index.ts
├── roadmap/
│   ├── useRoadmap.ts
│   ├── useToggleTask.ts
│   └── index.ts
├── nudges/
│   ├── useNudges.ts
│   ├── useAcceptNudge.ts
│   ├── useDismissNudge.ts
│   └── index.ts
├── chats/
│   ├── useConversations.ts
│   ├── useCreateConversation.ts
│   ├── useSendMessage.ts
│   └── index.ts
└── index.ts (barrel export)
```

---

## Phase 3: Migrate Admin Queries (25 min)

### 3.1 Create Admin Query Hooks

**File: `hooks/queries/admin/useUsers.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchUsers } from '../../../services/adminService';
import { useUser } from '../../../context/UserContext';

export function useUsers() {
  const { user } = useUser();

  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: fetchUsers,
    enabled: !!user && user.role === 'admin', // Only fetch for admin users
  });
}
```

**File: `hooks/queries/admin/useTemplates.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchTemplates } from '../../../services/adminService';
import { useUser } from '../../../context/UserContext';

export function useTemplates() {
  const { user } = useUser();

  return useQuery({
    queryKey: ['admin', 'templates'],
    queryFn: fetchTemplates,
    enabled: !!user && user.role === 'admin',
  });
}
```

**File: `hooks/queries/admin/useIntegrations.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchIntegrations } from '../../../services/adminService';
import { useUser } from '../../../context/UserContext';

export function useIntegrations() {
  const { user } = useUser();

  return useQuery({
    queryKey: ['admin', 'integrations'],
    queryFn: fetchIntegrations,
    enabled: !!user && user.role === 'admin',
  });
}
```

**File: `hooks/queries/admin/useUserDetail.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchUserDetail } from '../../../services/adminService';
import { useUser } from '../../../context/UserContext';

export function useUserDetail(userId: string) {
  const { user } = useUser();

  return useQuery({
    queryKey: ['admin', 'users', userId],
    queryFn: () => fetchUserDetail(userId),
    enabled: !!user && user.role === 'admin' && !!userId,
  });
}
```

### 3.2 Create Admin Mutation Hooks

**File: `hooks/queries/admin/useCreateUser.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createUser, type CreateUserPayload } from '../../../services/adminService';

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateUserPayload) => createUser(payload),
    onSuccess: () => {
      // Invalidate users list to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}
```

**File: `hooks/queries/admin/index.ts`** (barrel export)

```typescript
export { useUsers } from './useUsers';
export { useTemplates } from './useTemplates';
export { useIntegrations } from './useIntegrations';
export { useUserDetail } from './useUserDetail';
export { useCreateUser } from './useCreateUser';
```

### 3.3 Update PeopleView Component

**File: `components/views/admin/PeopleView/index.tsx`**

```typescript
// Remove: import { useAdmin } from "@/console/src/context/AdminContext";
// Add:
import { useUsers } from "@/console/src/hooks/queries/admin";

export default function PeopleView() {
  const navigate = useNavigate();
  // Remove: const { users, loading, error } = useAdmin();
  // Add:
  const { data: users = [], isLoading: loading, error } = useUsers();

  // Rest of component stays the same
}
```

### 3.4 Update TemplatesView Component

**File: `components/views/admin/TemplatesView/index.tsx`**

```typescript
// Remove: import { useAdmin } from "@/console/src/context/AdminContext";
// Add:
import { useTemplates } from "@/console/src/hooks/queries/admin";

export default function TemplatesView() {
  const navigate = useNavigate();
  // Remove: const { templates, loading, error } = useAdmin();
  // Add:
  const { data: templates = [], isLoading: loading, error } = useTemplates();

  // Rest of component stays the same
}
```

### 3.5 Update IntegrationsView Component

**File: `components/views/admin/IntegrationsView/index.tsx`**

```typescript
// Remove: import { useAdmin } from "@/console/src/context/AdminContext";
// Add:
import { useIntegrations } from "@/console/src/hooks/queries/admin";

export default function IntegrationsView() {
  // Remove: const { integrations, ... } = useAdmin();
  // Add:
  const { data: integrations = [], isLoading, error } = useIntegrations();

  // Keep local state for search, dialogs, etc.
  const [searchQuery, setSearchQuery] = useState("");
  const [slackDialogOpen, setSlackDialogOpen] = useState(false);

  // TODO: connectIntegration, disconnectIntegration will need mutation hooks later
  // For now, keep placeholder functions
}
```

### 3.6 Update AddNewUser Component

**File: `components/views/admin/PeopleView/AddNewUser.tsx`**

```typescript
// Remove: import { useAdmin } from "../../../../context/AdminContext";
// Remove: import { createUser } from "../../../../services/adminService";
// Add:
import { useTemplates, useCreateUser } from "@/console/src/hooks/queries/admin";

export default function AddNewUser() {
  const navigate = useNavigate();
  // Remove: const { templates, loading: templatesLoading, refetchData } = useAdmin();
  // Add:
  const { data: templates = [], isLoading: templatesLoading } = useTemplates();
  const createUserMutation = useCreateUser();
  const { toast } = useToast();

  // Remove: const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    // ... validation stays the same ...

    try {
      const selectedRole = roles.find((r) => r.value === role);

      await createUserMutation.mutateAsync({
        firstName,
        lastName,
        email,
        role: selectedRole?.label || "",
        startDate: format(date, "yyyy-MM-dd"),
        templateIds: selectedTemplates,
        sendWelcomeEmail: welcomeEmail,
      });

      toast({
        title: "Success",
        description: `${firstName} ${lastName} has been added successfully!`,
      });

      // Remove: refetchData(); (React Query auto-invalidates)

      navigate("/people");
    } catch (error) {
      console.error("Error creating user:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create user",
        variant: "destructive",
      });
    }
  };

  // Update button disabled state:
  // disabled={createUserMutation.isPending || templatesLoading}
  // {createUserMutation.isPending ? "Creating..." : "+ Add New Hire"}
}
```

### 3.7 Update PersonDetail Component

**File: `components/views/admin/PeopleView/PersonDetail.tsx`**

```typescript
import { useParams } from "react-router-dom";
import { useUserDetail } from "@/console/src/hooks/queries/admin";

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: userDetail, isLoading, error } = useUserDetail(id!);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!userDetail) return <div>User not found</div>;

  // Render user detail...
}
```

### 3.8 Simplify AdminContext

**File: `context/AdminContext.tsx`**

**Option A: Simplify (keep for non-server state)**

```typescript
import { createContext, useContext, useState, ReactNode } from "react";
import type { DashboardMetric, ProductivityData, NudgeTheme } from "../types";

interface AdminContextType {
  savingsMetric: DashboardMetric;
  timeToProductivity: DashboardMetric;
  productivityData: ProductivityData;
  nudgeThemes: NudgeTheme[];
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [savingsMetric] = useState<DashboardMetric>({
    label: "Total Savings",
    value: "$50,000",
    description: "Cost savings from AI-powered onboarding...",
    type: "currency",
  });

  const [timeToProductivity] = useState<DashboardMetric>({
    label: "Time to Productivity",
    value: "20 days",
    description: "Time for an employee to reach key milestones...",
    type: "time",
  });

  const [productivityData] = useState<ProductivityData>({
    automated: 10,
    manual: 0,
  });

  const [nudgeThemes] = useState<NudgeTheme[]>([
    { id: "1", label: "Ticket debugging", category: "support" },
    // ... rest
  ]);

  return (
    <AdminContext.Provider
      value={{
        savingsMetric,
        timeToProductivity,
        productivityData,
        nudgeThemes,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
}
```

**Option B: Delete entirely**
- Move constants to `lib/dashboardConfig.ts`
- Remove AdminProvider from App.tsx
- Update DashboardView to import from config file

---

## Phase 4: Migrate Roadmap Queries (15 min)

### 4.1 Create Roadmap Query Hook

**File: `hooks/queries/roadmap/useRoadmap.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchRoadmap } from '../../../services/roadmapService';
import { useUser } from '../../../context/UserContext';

export function useRoadmap() {
  const { user } = useUser();

  return useQuery({
    queryKey: ['roadmap', user?.id],
    queryFn: fetchRoadmap,
    enabled: !!user,
  });
}
```

### 4.2 Create Toggle Task Mutation

**File: `hooks/queries/roadmap/useToggleTask.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toggleTaskCompletion } from '../../../services/roadmapService';
import { useUser } from '../../../context/UserContext';
import type { Week } from '../../../types';

export function useToggleTask() {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: ({ taskId, completed }: { taskId: string; completed: boolean }) =>
      toggleTaskCompletion(taskId, completed),

    // Optimistic update
    onMutate: async ({ taskId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['roadmap', user?.id] });

      // Snapshot previous value
      const previousRoadmap = queryClient.getQueryData(['roadmap', user?.id]);

      // Optimistically update
      queryClient.setQueryData(['roadmap', user?.id], (old: any) => {
        if (!old) return old;

        const updatedWeeks = old.weeks.map((week: Week) => {
          const updatedTasks = week.tasks.map((task) =>
            task.id === taskId ? { ...task, completed: !task.completed } : task
          );

          const completedCount = updatedTasks.filter((t) => t.completed).length;
          const totalCount = updatedTasks.length;
          const newPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

          return {
            ...week,
            tasks: updatedTasks,
            percentage: newPercentage,
          };
        });

        return { ...old, weeks: updatedWeeks };
      });

      return { previousRoadmap };
    },

    // Rollback on error
    onError: (err, variables, context) => {
      if (context?.previousRoadmap) {
        queryClient.setQueryData(['roadmap', user?.id], context.previousRoadmap);
      }
    },

    // Always refetch after error or success
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['roadmap', user?.id] });
    },
  });
}
```

**File: `hooks/queries/roadmap/index.ts`**

```typescript
export { useRoadmap } from './useRoadmap';
export { useToggleTask } from './useToggleTask';
```

### 4.3 Update RoadmapView Component

**File: `components/views/employee/RoadmapView/index.tsx`**

```typescript
// Remove: import { useRoadmap } from "@/console/src/context/RoadmapContext";
// Add:
import { useRoadmap, useToggleTask } from "@/console/src/hooks/queries/roadmap";
import { useState } from "react";

export default function RoadmapView() {
  const navigate = useNavigate();
  // Remove: const { weeks, currentWeek, setCurrentWeek, toggleTask, loading, error } = useRoadmap();
  // Add:
  const { data: roadmap, isLoading: loading, error } = useRoadmap();
  const toggleTaskMutation = useToggleTask();
  const [currentWeek, setCurrentWeek] = useState(roadmap?.currentWeek || 1);

  // Extract weeks from roadmap data
  const weeks = roadmap?.weeks || [];

  const handleToggleTask = (taskId: string) => {
    // Find current completion status
    let currentCompleted = false;
    for (const week of weeks) {
      const task = week.tasks.find((t) => t.id === taskId);
      if (task) {
        currentCompleted = task.completed;
        break;
      }
    }

    toggleTaskMutation.mutate({
      taskId,
      completed: !currentCompleted,
    });
  };

  // Update all toggleTask(taskId) calls to handleToggleTask(taskId)
}
```

### 4.4 Remove RoadmapContext

**Delete file: `context/RoadmapContext.tsx`**

**Update App.tsx:**
```typescript
// Remove: import { RoadmapProvider } from "./context/RoadmapContext";
// Remove: <RoadmapProvider> wrapper
```

---

## Phase 5: Migrate Nudges Queries (15 min)

### 5.1 Create Nudges Query Hook

**File: `hooks/queries/nudges/useNudges.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchNudges } from '../../../services/nudgesService';
import { useUser } from '../../../context/UserContext';

export function useNudges() {
  const { user } = useUser();

  return useQuery({
    queryKey: ['nudges', user?.id],
    queryFn: async () => {
      const data = await fetchNudges();

      // Parse date strings to Date objects
      return data.nudges.map((nudge) => ({
        ...nudge,
        timestamp: new Date(nudge.timestamp),
        acceptedAt: nudge.acceptedAt ? new Date(nudge.acceptedAt) : null,
        resolvedAt: nudge.resolvedAt ? new Date(nudge.resolvedAt) : null,
        status: nudge.status as "waiting" | "accepted" | "declined" | "resolved",
      }));
    },
    enabled: !!user,
  });
}
```

### 5.2 Create Nudge Mutation Hooks

**File: `hooks/queries/nudges/useAcceptNudge.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { acceptNudge as acceptNudgeAPI } from '../../../services/nudgesService';
import { useUser } from '../../../context/UserContext';

export function useAcceptNudge() {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: (nudgeId: string) => acceptNudgeAPI(nudgeId),

    // Optimistic update
    onMutate: async (nudgeId) => {
      await queryClient.cancelQueries({ queryKey: ['nudges', user?.id] });
      const previousNudges = queryClient.getQueryData(['nudges', user?.id]);

      queryClient.setQueryData(['nudges', user?.id], (old: any) =>
        old?.map((nudge: any) =>
          nudge.id === nudgeId ? { ...nudge, status: 'accepted' } : nudge
        )
      );

      return { previousNudges };
    },

    onError: (err, variables, context) => {
      if (context?.previousNudges) {
        queryClient.setQueryData(['nudges', user?.id], context.previousNudges);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['nudges', user?.id] });
    },
  });
}
```

**File: `hooks/queries/nudges/useDismissNudge.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dismissNudge as dismissNudgeAPI } from '../../../services/nudgesService';
import { useUser } from '../../../context/UserContext';

export function useDismissNudge() {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: (nudgeId: string) => dismissNudgeAPI(nudgeId),

    // Optimistic update - remove from list
    onMutate: async (nudgeId) => {
      await queryClient.cancelQueries({ queryKey: ['nudges', user?.id] });
      const previousNudges = queryClient.getQueryData(['nudges', user?.id]);

      queryClient.setQueryData(['nudges', user?.id], (old: any) =>
        old?.filter((nudge: any) => nudge.id !== nudgeId)
      );

      return { previousNudges };
    },

    onError: (err, variables, context) => {
      if (context?.previousNudges) {
        queryClient.setQueryData(['nudges', user?.id], context.previousNudges);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['nudges', user?.id] });
    },
  });
}
```

**File: `hooks/queries/nudges/index.ts`**

```typescript
export { useNudges } from './useNudges';
export { useAcceptNudge } from './useAcceptNudge';
export { useDismissNudge } from './useDismissNudge';
```

### 5.3 Update NudgesView Component

**File: `components/views/employee/NudgesView/index.tsx`**

```typescript
// Remove: import { useNudges } from "@/console/src/context/NudgesContext";
// Add:
import { useNudges, useAcceptNudge, useDismissNudge } from "@/console/src/hooks/queries/nudges";

export default function NudgesView() {
  // Remove: const { nudges, acceptNudge, dismissNudge, loading, error } = useNudges();
  // Add:
  const { data: nudges = [], isLoading: loading, error } = useNudges();
  const acceptNudgeMutation = useAcceptNudge();
  const dismissNudgeMutation = useDismissNudge();

  const handleAccept = (nudgeId: string) => {
    acceptNudgeMutation.mutate(nudgeId);
  };

  const handleDismiss = (nudgeId: string) => {
    dismissNudgeMutation.mutate(nudgeId);
  };

  // Update all acceptNudge(id) calls to handleAccept(id)
  // Update all dismissNudge(id) calls to handleDismiss(id)
}
```

### 5.4 Remove NudgesContext

**Delete file: `context/NudgesContext.tsx`**

**Update App.tsx:**
```typescript
// Remove: import { NudgesProvider } from "./context/NudgesContext";
// Remove: <NudgesProvider> wrapper
```

---

## Phase 6: Migrate Chats/Conversations Queries (15 min)

### 6.1 Create Conversations Query Hook

**File: `hooks/queries/chats/useConversations.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchConversations } from '../../../services/chatsService';
import { useUser } from '../../../context/UserContext';

export function useConversations() {
  const { user } = useUser();

  return useQuery({
    queryKey: ['conversations', user?.id],
    queryFn: async () => {
      const data = await fetchConversations();

      // Parse date strings to Date objects
      return data.conversations.map((chat) => ({
        ...chat,
        timestamp: new Date(chat.timestamp),
        messages: chat.messages.map((msg) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })),
      }));
    },
    enabled: !!user,
  });
}
```

### 6.2 Create Chat Mutation Hooks

**File: `hooks/queries/chats/useCreateConversation.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createConversation } from '../../../services/chatsService';
import { useUser } from '../../../context/UserContext';
import type { Chat, Message } from '../../../types';

export function useCreateConversation() {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: (payload: { title: string; contextType: string; initialMessage: string }) =>
      createConversation(payload),

    onSuccess: (result) => {
      // Add new conversation to cache optimistically
      const firstUserMessage: Message = {
        id: `${result.conversation.id}-1`,
        role: "user",
        content: result.conversation.initialMessage || "",
        timestamp: new Date(),
      };

      const newChat: Chat = {
        id: result.conversation.id,
        title: result.conversation.title,
        lastMessage: result.conversation.initialMessage || "",
        timestamp: result.conversation.createdAt,
        unread: false,
        messages: [firstUserMessage],
      };

      queryClient.setQueryData(['conversations', user?.id], (old: any) =>
        old ? [newChat, ...old] : [newChat]
      );

      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['conversations', user?.id] });
    },
  });
}
```

**File: `hooks/queries/chats/useSendMessage.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendMessage as sendMessageAPI } from '../../../services/chatsService';
import { useUser } from '../../../context/UserContext';
import type { Message } from '../../../types';

export function useSendMessage() {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: ({ chatId, message }: { chatId: string; message: Omit<Message, 'id' | 'timestamp'> }) =>
      sendMessageAPI(chatId, {
        role: message.role,
        content: message.content,
        messageType: message.type,
        cardData: message.cardData,
      }),

    // Optimistic update
    onMutate: async ({ chatId, message }) => {
      await queryClient.cancelQueries({ queryKey: ['conversations', user?.id] });
      const previousConversations = queryClient.getQueryData(['conversations', user?.id]);

      const fullMessage: Message = {
        ...message,
        id: `temp-${Date.now()}`,
        timestamp: new Date(),
      };

      queryClient.setQueryData(['conversations', user?.id], (old: any) =>
        old?.map((chat: any) => {
          if (chat.id === chatId) {
            return {
              ...chat,
              messages: [...chat.messages, fullMessage],
              lastMessage: fullMessage.content,
              timestamp: fullMessage.timestamp,
            };
          }
          return chat;
        })
      );

      return { previousConversations, tempMessage: fullMessage };
    },

    onError: (err, variables, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(['conversations', user?.id], context.previousConversations);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', user?.id] });
    },
  });
}
```

**File: `hooks/queries/chats/index.ts`**

```typescript
export { useConversations } from './useConversations';
export { useCreateConversation } from './useCreateConversation';
export { useSendMessage } from './useSendMessage';
```

### 6.3 Update ChatsView Component

**File: `components/views/employee/ChatsView/index.tsx`**

```typescript
// Remove: import { useChats } from "@/console/src/context/ChatsContext";
// Add:
import { useConversations } from "@/console/src/hooks/queries/chats";

export default function ChatsView() {
  // Remove: const { chats, markAsRead, loading, error } = useChats();
  // Add:
  const { data: chats = [], isLoading: loading, error } = useConversations();

  // markAsRead can stay as local state update or create a mutation if backend supports it
  const [localChats, setLocalChats] = useState(chats);

  useEffect(() => {
    setLocalChats(chats);
  }, [chats]);

  const markAsRead = (chatId: string) => {
    setLocalChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, unread: false } : chat))
    );
    // TODO: Add API call to mark as read on backend
  };
}
```

### 6.4 Update NewChat Component

**File: `components/views/employee/ChatsView/NewChat.tsx`**

```typescript
// Remove: import { useChats } from "@/console/src/context/ChatsContext";
// Add:
import { useCreateConversation } from "@/console/src/hooks/queries/chats";

export default function NewChat() {
  const navigate = useNavigate();
  const createConversationMutation = useCreateConversation();

  const handleSubmit = async (message: string) => {
    try {
      const result = await createConversationMutation.mutateAsync({
        title: message.slice(0, 50) + (message.length > 50 ? "..." : ""),
        contextType: "general",
        initialMessage: message,
      });

      navigate(`/chats/${result.conversation.id}`);
    } catch (error) {
      console.error("Failed to create conversation:", error);
      // Show error toast
    }
  };
}
```

### 6.5 Update ChatDetail Component

**File: `components/views/employee/ChatsView/ChatDetail.tsx`**

```typescript
// Add:
import { useSendMessage } from "@/console/src/hooks/queries/chats";

export default function ChatDetail() {
  const { chatId } = useParams();
  const sendMessageMutation = useSendMessage();

  const handleSendMessage = (content: string) => {
    sendMessageMutation.mutate({
      chatId: chatId!,
      message: {
        role: 'user',
        content,
        type: 'text',
      },
    });
  };
}
```

### 6.6 Remove ChatsContext

**Delete file: `context/ChatsContext.tsx`**

**Update App.tsx:**
```typescript
// Remove: import { ChatsProvider } from "./context/ChatsContext";
// Remove: <ChatsProvider> wrapper
```

---

## Phase 7: Final Cleanup & App.tsx Update (10 min)

### 7.1 Update App.tsx Final Structure

**File: `App.tsx`**

Final structure:
```typescript
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './lib/queryClient';
import { UserProvider, useUser } from "./context/UserContext";
import { Toaster } from "@/components/ui/toaster";
// ... all component imports ...

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <UserProvider>
          <Routes>
            {/* All routes */}
          </Routes>
          <Toaster />
        </UserProvider>
      </HashRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
```

**Removed providers:**
- AdminProvider
- RoadmapProvider
- NudgesProvider
- ChatsProvider

### 7.2 Create Barrel Export for All Query Hooks

**File: `hooks/queries/index.ts`**

```typescript
// Admin queries
export * from './admin';

// Roadmap queries
export * from './roadmap';

// Nudges queries
export * from './nudges';

// Chats queries
export * from './chats';
```

Now components can import like:
```typescript
import { useUsers, useTemplates, useRoadmap, useNudges } from "@/console/src/hooks/queries";
```

---

## Phase 8: Testing & Verification (15 min)

### 8.1 Manual Testing Checklist

**Admin Features:**
- [ ] Navigate to People page - users load correctly
- [ ] Create new user - appears in list immediately after creation
- [ ] Navigate away and back - users still showing (cached)
- [ ] Templates page loads correctly
- [ ] Integrations page loads correctly
- [ ] Window focus - data refetches automatically

**Employee Features:**
- [ ] Roadmap loads correctly
- [ ] Toggle task - updates immediately (optimistic)
- [ ] Nudges load correctly
- [ ] Accept nudge - updates immediately
- [ ] Dismiss nudge - removes immediately
- [ ] Create new chat - navigates to chat detail
- [ ] Send message - appears immediately

**DevTools:**
- [ ] Open React Query DevTools (bottom-right icon)
- [ ] Verify queries are cached with correct keys
- [ ] Test refetch button in DevTools
- [ ] Inspect stale/fresh status

### 8.2 Error Handling Test

- [ ] Disconnect network - queries show error state
- [ ] Reconnect network - queries auto-refetch
- [ ] Failed mutation - optimistic update rolls back

### 8.3 Performance Check

- [ ] No duplicate API calls on mount
- [ ] Navigation between pages uses cache (no refetch if fresh)
- [ ] Multiple components using same query = 1 API call

---

## Phase 9: Documentation (5 min)

### 9.1 Query Conventions Document

**File: `apps/electron/QUERY_CONVENTIONS.md`**

```markdown
# React Query Conventions

## Query Keys

- Admin: `['admin', resource]` - e.g., `['admin', 'users']`
- User-specific: `[resource, userId]` - e.g., `['roadmap', userId]`
- Detail: `[resource, id]` - e.g., `['admin', 'users', userId]`

## Stale Time

- Default: 30 seconds
- Adjust per-query if needed

## Adding New Queries

1. Create hook in `hooks/queries/{domain}/use{Resource}.ts`
2. Export from `hooks/queries/{domain}/index.ts`
3. Use in component: `const { data, isLoading, error } = useResource()`

## Adding New Mutations

1. Create hook in `hooks/queries/{domain}/use{Action}.ts`
2. Invalidate relevant queries in `onSuccess`
3. Use optimistic updates for instant feedback
4. Use in component: `mutation.mutate(data)`

## DevTools

Press Cmd+Shift+D to toggle React Query DevTools in development.
```

---

## Before & After Comparison

### Before (Manual Context)

```typescript
// Context file: ~100 lines
const [users, setUsers] = useState([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);

const fetchUsers = async () => {
  setLoading(true);
  try {
    const data = await apiRequest('/admin/users');
    setUsers(data.users);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};

useEffect(() => { fetchUsers() }, [user]);

// Component
const { users, loading, error } = useAdmin();
```

### After (React Query)

```typescript
// Hook file: ~10 lines
export function useUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: fetchUsers,
    staleTime: 30000,
    enabled: !!user && user.role === 'admin'
  });
}

// Component
const { data: users, isLoading, error } = useUsers();
```

**Savings:** 90% less boilerplate per query

---

## Summary of Changes

### Files Created (20 new files)

1. `lib/queryClient.ts`
2-7. `hooks/queries/admin/*` (6 files)
8-10. `hooks/queries/roadmap/*` (3 files)
11-14. `hooks/queries/nudges/*` (4 files)
15-18. `hooks/queries/chats/*` (4 files)
19. `hooks/queries/index.ts`
20. `QUERY_CONVENTIONS.md`

### Files Modified (12 files)

1. `package.json` - Add dependencies
2. `App.tsx` - Add QueryClientProvider, remove 3 context providers
3. `context/AdminContext.tsx` - Simplified or deleted
4. `components/views/admin/PeopleView/index.tsx`
5. `components/views/admin/TemplatesView/index.tsx`
6. `components/views/admin/IntegrationsView/index.tsx`
7. `components/views/admin/PeopleView/AddNewUser.tsx`
8. `components/views/admin/PeopleView/PersonDetail.tsx`
9. `components/views/employee/RoadmapView/index.tsx`
10. `components/views/employee/NudgesView/index.tsx`
11. `components/views/employee/ChatsView/index.tsx`
12. `components/views/employee/ChatsView/NewChat.tsx`
13. `components/views/employee/ChatsView/ChatDetail.tsx`

### Files Deleted (3 files)

1. `context/RoadmapContext.tsx`
2. `context/NudgesContext.tsx`
3. `context/ChatsContext.tsx`

### Net Result

- **+20 files, -3 files**
- **~800 lines of new code**
- **~600 lines of deleted code**
- **Net: +200 lines** (but way better architecture)

---

## Rollback Plan

If something breaks:

1. Revert App.tsx to use old providers
2. Keep query hooks for future use
3. Debug specific issue
4. Migrate one context at a time instead of all at once

**Recommendation: Migrate in order (Admin → Roadmap → Nudges → Chats) and test after each.**

---

## Next Steps After Migration

1. **Add more query hooks** as you build new features (5 lines vs 30 lines)
2. **Explore advanced features:**
   - Infinite queries for pagination
   - Parallel queries for dependent data
   - Query cancellation
   - Prefetching
3. **Monitor with DevTools** to optimize staleTime/gcTime per query
4. **Consider SWR comparison** if you want to evaluate alternatives

---

## Questions & Troubleshooting

### Q: What if I need to refetch manually?

Use the `refetch` function from the query:
```typescript
const { data, refetch } = useUsers();
// Later:
refetch();
```

### Q: How do I invalidate multiple queries?

```typescript
queryClient.invalidateQueries({ queryKey: ['admin'] }); // All admin queries
```

### Q: Can I disable auto-refetch on window focus?

Yes, set `refetchOnWindowFocus: false` in query options or globally in queryClient.

### Q: How do I handle dependent queries?

Use the `enabled` option:
```typescript
const { data: user } = useUser();
const { data: posts } = useUserPosts(user?.id, { enabled: !!user?.id });
```

### Q: Should I use React Query for local state?

No. React Query is for server state. Use useState/useReducer for local UI state.

---

## Estimated Timeline

- **Phase 1-2:** 15 min (setup)
- **Phase 3:** 25 min (admin queries)
- **Phase 4:** 15 min (roadmap)
- **Phase 5:** 15 min (nudges)
- **Phase 6:** 15 min (chats)
- **Phase 7:** 10 min (cleanup)
- **Phase 8:** 15 min (testing)
- **Phase 9:** 5 min (docs)

**Total: ~2 hours** (including testing and documentation)

---

## Success Criteria

✅ All views load data correctly
✅ Mutations update cache automatically
✅ Optimistic updates work
✅ DevTools show correct query states
✅ No console errors
✅ Performance improved (fewer API calls)
✅ Code is cleaner and more maintainable
