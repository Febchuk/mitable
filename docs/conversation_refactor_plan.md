# Conversation Window Refactor: Collapsed Combobox State

## Executive Summary

**Goal:** Transform the conversation window from a simple show/hide binary state into a three-state system with a collapsed combobox view for conversation switching.

**Key Features:**

- 🔍 Searchable conversation switcher
- 📝 "New Chat" creation from combobox
- 🔄 Seamless conversation switching without closing Agent
- 🔗 Console integration: "Send to Agent" button
- 💾 Auto-save draft messages per conversation
- 🤖 AI-generated conversation titles

**Timeline:** 2-3 weeks

---

## Architecture Overview

### Three-State System

```
┌─────────────────────────────────────────────┐
│          HIDDEN (default state)             │
│   No conversation window visible            │
└─────────────────────────────────────────────┘
                    ↓ Agent pill click
┌─────────────────────────────────────────────┐
│   COLLAPSED (combobox state: 740x120)       │
│   ┌─────────────────────────────────────┐   │
│   │ 🔍 Search conversations...         │   │
│   ├─────────────────────────────────────┤   │
│   │ ➕ New Chat                         │   │
│   │ 💬 Help with billing API           │   │
│   │ 💬 Password reset question         │   │
│   │ 💬 Feature request discussion      │   │
│   └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
                    ↓ Select conversation
┌─────────────────────────────────────────────┐
│    EXPANDED (full chat: 740x600)            │
│   ┌─────────────────────────────────────┐   │
│   │ Help with billing API           ✕  │   │
│   ├─────────────────────────────────────┤   │
│   │                                     │   │
│   │ User: How do I...                  │   │
│   │ AI: Here's how...                  │   │
│   │                                     │   │
│   ├─────────────────────────────────────┤   │
│   │ Type your message...           [→] │   │
│   └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
                    ↓ Close (✕) or Esc
┌─────────────────────────────────────────────┐
│   Back to COLLAPSED (combobox)              │
└─────────────────────────────────────────────┘
```

### State Transitions

| Current State | Action                  | Next State | Window Size |
| ------------- | ----------------------- | ---------- | ----------- |
| HIDDEN        | Click agent pill        | COLLAPSED  | 740x120     |
| COLLAPSED     | Select conversation     | EXPANDED   | 740x600     |
| COLLAPSED     | Click "New Chat"        | EXPANDED   | 740x600     |
| COLLAPSED     | Click away              | HIDDEN     | -           |
| EXPANDED      | Click close (✕)         | COLLAPSED  | 740x120     |
| EXPANDED      | Press Esc               | COLLAPSED  | 740x120     |
| ANY           | Console "Send to Agent" | EXPANDED   | 740x600     |

---

## Phase 1: State Management & IPC Foundation

### 1.1 New IPC Channels

**File:** `packages/shared/src/ipc.ts`

```typescript
export const IPC_CHANNELS = {
  // ... existing channels

  // Conversation state management
  CONVERSATION_SET_STATE: "conversation-set-state",
  CONVERSATION_LOAD: "conversation-load",
  CONVERSATION_SWITCH: "conversation-switch",

  // Console integration
  AGENT_OPEN_CONVERSATION: "agent-open-conversation",

  // Conversation list
  CONVERSATION_LIST_REQUEST: "conversation-list-request",
  CONVERSATION_LIST_RESPONSE: "conversation-list-response",

  // Title generation
  CONVERSATION_GENERATE_TITLE: "conversation-generate-title",
} as const;
```

### 1.2 Update Conversation Preload

**File:** `apps/electron/src/preload/conversation.ts`

```typescript
contextBridge.exposeInMainWorld('conversationAPI', {
  // Existing methods
  sendMessage: (message: string) => ...,
  onReceiveMessage: (callback) => ...,

  // NEW: State management
  setViewState: (state: 'hidden' | 'collapsed' | 'expanded') =>
    ipcRenderer.send(IPC_CHANNELS.CONVERSATION_SET_STATE, state),

  // NEW: Conversation loading
  onConversationLoad: (callback: (conversationId: string) => void) =>
    ipcRenderer.on(IPC_CHANNELS.CONVERSATION_LOAD, (_event, id) => callback(id)),

  // NEW: Conversation list
  requestConversationList: () =>
    ipcRenderer.send(IPC_CHANNELS.CONVERSATION_LIST_REQUEST),
  onConversationList: (callback: (conversations: Conversation[]) => void) =>
    ipcRenderer.on(IPC_CHANNELS.CONVERSATION_LIST_RESPONSE, (_event, data) => callback(data)),

  // NEW: Switching
  switchConversation: (conversationId: string) =>
    ipcRenderer.send(IPC_CHANNELS.CONVERSATION_SWITCH, conversationId),
});
```

### 1.3 Update Agent Preload

**File:** `apps/electron/src/preload/agent.ts`

Modify pill click behavior to show collapsed (not expanded):

```typescript
// OLD behavior
showConversation: () => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_SHOW),

// NEW behavior
toggleConversation: () => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_TOGGLE),
```

### 1.4 Main Process IPC Handlers

**File:** `apps/electron/src/main.ts`

```typescript
// NEW: Toggle conversation (collapsed combobox)
ipcMain.on(IPC_CHANNELS.CONVERSATION_TOGGLE, () => {
  if (!conversationWindow || conversationWindow.isDestroyed()) return;

  if (conversationWindow.isVisible()) {
    conversationWindow.hide();
  } else {
    positionConversationWindow("collapsed"); // 740x120
    conversationWindow.show();
    // Trigger conversation list fetch
    conversationWindow.webContents.send(IPC_CHANNELS.CONVERSATION_LIST_REQUEST);
  }
});

// NEW: Set conversation state (handles window sizing)
ipcMain.on(
  IPC_CHANNELS.CONVERSATION_SET_STATE,
  (_event, state: "hidden" | "collapsed" | "expanded") => {
    if (!conversationWindow || conversationWindow.isDestroyed()) return;

    switch (state) {
      case "hidden":
        conversationWindow.hide();
        break;
      case "collapsed":
        positionConversationWindow("collapsed"); // 740x120
        if (!conversationWindow.isVisible()) conversationWindow.show();
        break;
      case "expanded":
        positionConversationWindow("expanded"); // 740x600
        if (!conversationWindow.isVisible()) conversationWindow.show();
        break;
    }
  }
);

// NEW: Open specific conversation from Console
ipcMain.on(IPC_CHANNELS.AGENT_OPEN_CONVERSATION, (_event, conversationId: string) => {
  if (!agentWindow || agentWindow.isDestroyed()) return;
  if (!conversationWindow || conversationWindow.isDestroyed()) return;

  // Show agent if hidden
  if (!agentWindow.isVisible()) agentWindow.show();

  // Position and show conversation in expanded state
  positionConversationWindow("expanded");
  conversationWindow.show();

  // Load the specific conversation
  conversationWindow.webContents.send(IPC_CHANNELS.CONVERSATION_LOAD, conversationId);
});

// NEW: Handle conversation list request (fetch from backend)
ipcMain.on(IPC_CHANNELS.CONVERSATION_LIST_REQUEST, async () => {
  if (!conversationWindow || conversationWindow.isDestroyed()) return;

  try {
    // Fetch from backend
    const response = await fetch(`${API_BASE_URL}/api/conversations`, {
      headers: { Authorization: `Bearer ${authTokens.accessToken}` },
    });
    const conversations = await response.json();

    // Send back to renderer
    conversationWindow.webContents.send(IPC_CHANNELS.CONVERSATION_LIST_RESPONSE, conversations);
  } catch (error) {
    console.error("[Conversation] Failed to fetch conversation list:", error);
    conversationWindow.webContents.send(IPC_CHANNELS.CONVERSATION_LIST_RESPONSE, []);
  }
});
```

**Update `positionConversationWindow()`:**

```typescript
function positionConversationWindow(state: "collapsed" | "expanded" = "expanded") {
  if (
    !agentWindow ||
    agentWindow.isDestroyed() ||
    !conversationWindow ||
    conversationWindow.isDestroyed()
  ) {
    return;
  }

  const pillBounds = agentWindow.getBounds();
  const conversationWidth = 740;
  const conversationHeight = state === "collapsed" ? 120 : 600;
  const gap = 16;

  // Calculate centered position above pill
  const x = pillBounds.x + (pillBounds.width - conversationWidth) / 2;
  const y = pillBounds.y - conversationHeight - gap;

  conversationWindow.setBounds(
    {
      x: Math.round(x),
      y: Math.round(y),
      width: conversationWidth,
      height: conversationHeight,
    },
    true
  ); // animate: true for smooth transition
}
```

---

## Phase 2: Collapsed View UI Components

### 2.1 Component Structure

**New Directory:** `apps/electron/src/renderer/conversation/src/components/`

```
components/
├── CollapsedView/
│   ├── index.tsx              # Main wrapper component
│   ├── SearchInput.tsx        # Search bar with icon
│   ├── NewChatOption.tsx      # "New Chat" button at top
│   └── ConversationList.tsx   # Scrollable list of conversations
└── ExpandedView/
    ├── index.tsx              # Main wrapper component
    ├── ChatHeader.tsx         # Title + close button
    └── MessageList.tsx        # Existing chat UI (refactored)
```

### 2.2 CollapsedView Component

**File:** `components/CollapsedView/index.tsx`

```tsx
import { useState, useEffect } from "react";
import SearchInput from "./SearchInput";
import NewChatOption from "./NewChatOption";
import ConversationList from "./ConversationList";

interface Conversation {
  id: string;
  title: string;
  lastMessageAt: string;
}

interface CollapsedViewProps {
  onSelectConversation: (conversationId: string) => void;
  onNewChat: () => void;
}

export default function CollapsedView({ onSelectConversation, onNewChat }: CollapsedViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Request conversation list from main process
    window.conversationAPI.requestConversationList();

    // Listen for response
    window.conversationAPI.onConversationList((data) => {
      setConversations(data);
      setLoading(false);
    });
  }, []);

  const filteredConversations = conversations.filter((conv) =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full h-[120px] bg-[#2a2a2a] rounded-2xl flex flex-col p-3 gap-2">
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search conversations..."
      />

      <div className="flex-1 overflow-y-auto">
        <NewChatOption onClick={onNewChat} />
        <ConversationList
          conversations={filteredConversations}
          onSelect={onSelectConversation}
          loading={loading}
        />
      </div>
    </div>
  );
}
```

**File:** `components/CollapsedView/SearchInput.tsx`

```tsx
import { Search } from "lucide-react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchInput({ value, onChange, placeholder }: SearchInputProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 pl-10 pr-3 bg-[#1a1a1a] text-white text-sm rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}
```

**File:** `components/CollapsedView/NewChatOption.tsx`

```tsx
import { Plus } from "lucide-react";

interface NewChatOptionProps {
  onClick: () => void;
}

export default function NewChatOption({ onClick }: NewChatOptionProps) {
  return (
    <button
      onClick={onClick}
      className="w-full h-10 flex items-center gap-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors mb-2"
    >
      <Plus className="w-4 h-4" />
      <span className="font-medium text-sm">New Chat</span>
    </button>
  );
}
```

**File:** `components/CollapsedView/ConversationList.tsx`

```tsx
import { MessageSquare } from "lucide-react";

interface Conversation {
  id: string;
  title: string;
  lastMessageAt: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  onSelect: (conversationId: string) => void;
  loading?: boolean;
}

export default function ConversationList({
  conversations,
  onSelect,
  loading,
}: ConversationListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-20">
        <div className="text-gray-400 text-sm">Loading conversations...</div>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-20">
        <div className="text-gray-400 text-sm">No conversations found</div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className="w-full h-10 flex items-center gap-2 px-3 bg-[#1a1a1a] hover:bg-[#2f2f2f] text-white rounded-lg transition-colors"
        >
          <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm truncate flex-1 text-left">{conv.title}</span>
        </button>
      ))}
    </div>
  );
}
```

---

## Future Phases

See sections Phase 3-8 in implementation for:

- Backend API endpoints
- Conversation switching & state preservation
- Console integration
- Search implementation
- Polish & edge cases
- Testing

---

## Implementation Timeline

| Phase   | Tasks                            | Duration | Dependencies    |
| ------- | -------------------------------- | -------- | --------------- |
| Phase 1 | IPC foundation, state management | 2 days   | None            |
| Phase 2 | Collapsed UI components          | 3 days   | Phase 1         |
| Phase 3 | Backend API endpoints            | 2 days   | None (parallel) |
| Phase 4 | Conversation switching, drafts   | 3 days   | Phase 1, 2, 3   |
| Phase 5 | Console integration              | 1 day    | Phase 1, 4      |
| Phase 6 | Search implementation            | 1 day    | Phase 2, 4      |
| Phase 7 | Polish, animations, edge cases   | 3 days   | Phase 2, 4      |
| Phase 8 | Testing                          | 3 days   | All phases      |

**Total: 18 days (~3.5 weeks)**
