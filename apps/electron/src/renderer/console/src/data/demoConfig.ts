/**
 * Demo Configuration for Update Buddy Feature
 *
 * This file contains ALL hardcoded demo content in a single place.
 * Edit this file to customize the entire demo experience.
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface DemoUser {
  id: string;
  name: string;
}

export interface DemoChannel {
  id: string;
  name: string;
  isPrivate: boolean;
}

export interface DemoAIResponse {
  keywords: string[];
  aiResponse: string;
  suggestedEdit: string;
}

// ============================================
// DEMO CONFIGURATION
// ============================================

export const DEMO_CONFIG = {
  // ============================================
  // RECIPIENTS (Users & Channels)
  // ============================================
  recipients: {
    users: [
      { id: "U001", name: "Emily Rodriguez" },
      { id: "U002", name: "Alex Chen" },
      { id: "U003", name: "Sarah Kim" },
      { id: "U004", name: "Michael Johnson" },
      { id: "U005", name: "Jessica Williams" },
      { id: "U006", name: "David Brown" },
    ] as DemoUser[],

    channels: [
      { id: "C001", name: "#engineering", isPrivate: false },
      { id: "C002", name: "#design-team", isPrivate: false },
      { id: "C003", name: "#project-alpha", isPrivate: true },
      { id: "C004", name: "#general", isPrivate: false },
      { id: "C005", name: "#announcements", isPrivate: false },
      { id: "C006", name: "#random", isPrivate: false },
    ] as DemoChannel[],

    defaultRecipientId: "C001", // Default to #engineering
  },

  // ============================================
  // DRAFT CONTENT
  // ============================================
  draft: {
    id: "demo-draft-001",
    topic: "Weekly standup update ready",
    content: `## What I worked on this week

- Completed the user authentication flow refactor (PR #342)
- Fixed the memory leak in the dashboard component
- Reviewed 5 pull requests from the team

## What I'm planning for next week

- Start implementing the new notification system
- Pair with Sarah on the database migration
- Write documentation for the auth changes

## Blockers

- Still waiting on design specs for the settings page
- Need access to the staging environment for testing`,
    recipient: "#engineering-standup",
  },

  // ============================================
  // AI CHAT RESPONSES
  // ============================================
  ai: {
    welcomeMessage:
      "I can help you refine your update. Try asking me to make it shorter, more professional, or add metrics!",
    fallbackResponse:
      "I've analyzed your request. I can help you make your update shorter, more professional, or add specific metrics. What would you like me to do?",
    appliedMessage: "Done! I've updated your draft with the suggested changes.",

    responses: {
      shorter: {
        keywords: ["short", "shorter", "concise", "brief", "condense"],
        aiResponse:
          "I'll condense the update while keeping the key points. Here's a more concise version:",
        suggestedEdit: `## This Week
- Completed auth flow refactor (PR #342)
- Fixed dashboard memory leak
- Reviewed 5 PRs

## Next Week
- New notification system
- DB migration with Sarah
- Auth documentation

## Blockers
- Awaiting settings page design specs
- Need staging environment access`,
      } as DemoAIResponse,

      professional: {
        keywords: ["professional", "formal", "business", "corporate"],
        aiResponse: "I'll adjust the tone to be more formal and professional:",
        suggestedEdit: `## Completed Items

- Successfully delivered the user authentication flow refactor (PR #342), improving code maintainability
- Resolved critical memory leak affecting dashboard performance
- Conducted thorough code reviews for 5 team pull requests

## Upcoming Priorities

- Initiate development of the notification system architecture
- Collaborate with Sarah on database migration planning
- Produce comprehensive documentation for authentication changes

## Dependencies & Blockers

- Pending: Design specifications for settings page functionality
- Required: Access credentials for staging environment validation`,
      } as DemoAIResponse,

      metrics: {
        keywords: ["metric", "metrics", "number", "numbers", "data", "quantify"],
        aiResponse: "I'll add quantifiable metrics to make the update more impactful:",
        suggestedEdit: `## What I worked on this week

- Completed the user authentication flow refactor (PR #342) - reduced code complexity by 30%
- Fixed the memory leak in the dashboard component - improved performance by 2x
- Reviewed 5 pull requests from the team (avg. turnaround: 4 hours)

## What I'm planning for next week

- Start implementing the new notification system (estimated 3-4 days)
- Pair with Sarah on the database migration (targeting 2TB of data)
- Write documentation for the auth changes (4 pages planned)

## Blockers

- Still waiting on design specs for the settings page (blocked for 3 days)
- Need access to the staging environment for testing (ticket submitted)`,
      } as DemoAIResponse,
    },
  },

  // ============================================
  // UI TEXT / COPY
  // ============================================
  ui: {
    draftEditor: {
      placeholder: "Write your update...",
      tip: "Tip: Use markdown formatting for better readability",
      sendButton: "Send Update",
      sendingButton: "Sending...",
    },

    aiChat: {
      inputPlaceholder: "Ask AI to help edit...",
      sendingToLabel: "Sending to",
    },

    recipientSelector: {
      searchPlaceholder: "Search users or channels...",
      addMorePlaceholder: "Add more recipients...",
      allSelectedMessage: "All recipients selected",
      noResultsMessage: "No results found",
      usersHeader: "Users",
      channelsHeader: "Channels",
    },

    success: {
      title: "Update sent!",
      message: "Your update has been posted to",
    },
  },

  // ============================================
  // NOTIFICATION WINDOWS
  // ============================================
  notifications: {
    watchingPill: {
      pauseButton: "Pause",
      resumeButton: "Resume",
      sendUpdateButton: "Send Update",
    },
  },
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Find an AI response based on keywords in the user's query
 */
export function findAIResponseFromConfig(
  query: string
): { aiResponse: string; suggestedEdit: string } | null {
  const lowerQuery = query.toLowerCase();

  for (const response of Object.values(DEMO_CONFIG.ai.responses)) {
    if (response.keywords.some((keyword) => lowerQuery.includes(keyword))) {
      return {
        aiResponse: response.aiResponse,
        suggestedEdit: response.suggestedEdit,
      };
    }
  }

  return null;
}

/**
 * Get a recipient by ID (user or channel)
 */
export function getRecipientByIdFromConfig(id: string): (DemoUser | DemoChannel) | undefined {
  const user = DEMO_CONFIG.recipients.users.find((u) => u.id === id);
  if (user) return user;

  const channel = DEMO_CONFIG.recipients.channels.find((c) => c.id === id);
  return channel;
}

/**
 * Get all recipients (users + channels combined)
 */
export function getAllRecipientsFromConfig(): (DemoUser | DemoChannel)[] {
  return [...DEMO_CONFIG.recipients.users, ...DEMO_CONFIG.recipients.channels];
}
