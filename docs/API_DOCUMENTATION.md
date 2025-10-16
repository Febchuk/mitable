# Mitable API Documentation

**Version**: 1.0
**Base URL**: `http://localhost:3000/api` (development)
**Authentication**: Bearer token (JWT via Supabase Auth)

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [User Profile](#2-user-profile)
3. [Conversations (Help System)](#3-conversations-help-system)
4. [Roadmaps](#4-roadmaps)
5. [Nudges (Expert Matching)](#5-nudges-expert-matching)
6. [Experts](#6-experts)
7. [Admin - Dashboard](#7-admin---dashboard)
8. [Admin - Templates](#8-admin---templates)
9. [Admin - People Management](#9-admin---people-management)
10. [Admin - Integrations](#10-admin---integrations)
11. [Admin - Analytics](#11-admin---analytics)
12. [Organizations](#12-organizations)
13. [Source Materials](#13-source-materials)
14. [Error Handling](#error-handling)
15. [Implementation Phases](#implementation-phases)

---

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <access_token>
```

### POST /auth/signup

Create a new user account.

**Status**: ✅ Implemented

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "firstName": "John",
  "lastName": "Doe",
  "organizationId": "uuid"
}
```

**Response** (201):
```json
{
  "success": true,
  "session": {
    "access_token": "jwt_token",
    "refresh_token": "jwt_refresh_token",
    "expires_in": 3600,
    "token_type": "bearer"
  },
  "profile": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "employee",
    "organizationId": "uuid"
  }
}
```

---

### POST /auth/login

Authenticate existing user.

**Status**: ✅ Implemented

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response** (200):
```json
{
  "success": true,
  "session": {
    "access_token": "jwt_token",
    "refresh_token": "jwt_refresh_token",
    "expires_in": 3600,
    "token_type": "bearer"
  },
  "profile": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "employee",
    "organizationId": "uuid",
    "currentWeek": 2,
    "avatarUrl": "https://..."
  }
}
```

---

### POST /auth/logout

Invalidate current session.

**Status**: ✅ Implemented

**Headers**: Authorization required

**Response** (200):
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### POST /auth/refresh

Refresh access token using refresh token.

**Status**: ✅ Implemented

**Request Body**:
```json
{
  "refresh_token": "jwt_refresh_token"
}
```

**Response** (200):
```json
{
  "success": true,
  "session": {
    "access_token": "new_jwt_token",
    "refresh_token": "new_jwt_refresh_token",
    "expires_in": 3600,
    "token_type": "bearer"
  }
}
```

---

## 2. User Profile

### GET /auth/me

Get current authenticated user's profile.

**Status**: ✅ Implemented

**Headers**: Authorization required

**Response** (200):
```json
{
  "success": true,
  "profile": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "employee",
    "organizationId": "uuid",
    "currentWeek": 2,
    "avatarUrl": "https://...",
    "startDate": "2025-01-15T00:00:00Z",
    "createdAt": "2025-01-10T10:30:00Z"
  }
}
```

---

### PATCH /users/me

Update current user's profile.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required

**Request Body** (partial update):
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "avatarUrl": "https://..."
}
```

**Response** (200):
```json
{
  "success": true,
  "profile": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "Jane",
    "lastName": "Smith",
    "avatarUrl": "https://...",
    "updatedAt": "2025-01-16T12:00:00Z"
  }
}
```

---

### POST /users/me/avatar

Upload profile avatar.

**Status**: 🔨 Needed (Phase 3)

**Headers**:
- Authorization required
- Content-Type: multipart/form-data

**Request Body**: FormData with `file` field

**Response** (200):
```json
{
  "success": true,
  "avatarUrl": "https://storage.supabase.co/..."
}
```

---

## 3. Conversations (Help System)

### GET /conversations

Get all conversations for the current user.

**Status**: ✅ Implemented

**Headers**: Authorization required

**Query Parameters**:
- `limit` (optional): Number of conversations to return (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response** (200):
```json
{
  "success": true,
  "conversations": [
    {
      "id": "uuid",
      "userId": "uuid",
      "title": "How to set up my dev environment?",
      "contextType": "help_request",
      "status": "active",
      "lastMessageAt": "2025-01-16T10:30:00Z",
      "createdAt": "2025-01-16T09:00:00Z",
      "unreadCount": 2
    }
  ],
  "total": 15,
  "hasMore": false
}
```

---

### POST /conversations

Create a new conversation.

**Status**: ✅ Implemented

**Headers**: Authorization required

**Request Body**:
```json
{
  "title": "Setting up development environment",
  "contextType": "help_request",
  "initialMessage": "I need help setting up my local development environment"
}
```

**Response** (201):
```json
{
  "success": true,
  "conversation": {
    "id": "uuid",
    "userId": "uuid",
    "title": "Setting up development environment",
    "contextType": "help_request",
    "status": "active",
    "createdAt": "2025-01-16T10:00:00Z"
  }
}
```

---

### GET /conversations/:id/messages

Get all messages for a specific conversation.

**Status**: ✅ Implemented

**Headers**: Authorization required

**Response** (200):
```json
{
  "success": true,
  "messages": [
    {
      "id": "uuid",
      "conversationId": "uuid",
      "role": "user",
      "content": "I need help setting up my local development environment",
      "messageType": "text",
      "timestamp": "2025-01-16T10:00:00Z",
      "sources": []
    },
    {
      "id": "uuid",
      "conversationId": "uuid",
      "role": "assistant",
      "content": "I'll help you set up your development environment. First, let's...",
      "messageType": "text",
      "timestamp": "2025-01-16T10:00:15Z",
      "sources": [
        {
          "title": "Dev Setup Guide",
          "url": "https://docs.company.com/setup",
          "relevanceScore": 0.92
        }
      ]
    }
  ]
}
```

---

### POST /conversations/:id/messages

Send a message in a conversation.

**Status**: ✅ Implemented

**Headers**: Authorization required

**Request Body**:
```json
{
  "role": "user",
  "content": "How do I install Node.js?",
  "messageType": "text"
}
```

**Response** (201):
```json
{
  "success": true,
  "message": {
    "id": "uuid",
    "conversationId": "uuid",
    "role": "user",
    "content": "How do I install Node.js?",
    "messageType": "text",
    "timestamp": "2025-01-16T10:05:00Z"
  }
}
```

---

### POST /conversations/:id/screenshot

Submit a screenshot for contextual help (Cmd+H flow).

**Status**: 🔨 Needed (Phase 1 - HIGH PRIORITY)

**Headers**:
- Authorization required
- Content-Type: multipart/form-data

**Request Body**: FormData with:
- `screenshot`: Image file (PNG/JPEG)
- `question`: User's question text
- `windowTitle`: Active window title

**Response** (200):
```json
{
  "success": true,
  "analysis": {
    "detectedElements": [
      {
        "type": "button",
        "text": "Save",
        "bbox": { "x": 100, "y": 200, "width": 80, "height": 40 }
      }
    ],
    "intent": "User wants to save a document",
    "response": {
      "steps": [
        {
          "instruction": "Click the Save button",
          "targetElement": { "x": 140, "y": 220 },
          "highlightBox": { "x": 100, "y": 200, "width": 80, "height": 40 }
        }
      ],
      "sources": [
        {
          "title": "File Management Guide",
          "url": "https://...",
          "relevanceScore": 0.88
        }
      ]
    }
  },
  "processingTime": 3.2
}
```

---

### PATCH /conversations/:id

Update conversation metadata.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required

**Request Body**:
```json
{
  "title": "Updated conversation title",
  "status": "resolved"
}
```

**Response** (200):
```json
{
  "success": true,
  "conversation": {
    "id": "uuid",
    "title": "Updated conversation title",
    "status": "resolved",
    "updatedAt": "2025-01-16T10:30:00Z"
  }
}
```

---

### DELETE /conversations/:id

Archive a conversation.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required

**Response** (200):
```json
{
  "success": true,
  "message": "Conversation archived successfully"
}
```

---

## 4. Roadmaps

### GET /roadmaps

Get the current user's roadmap (all weeks and tasks).

**Status**: ✅ Implemented

**Headers**: Authorization required

**Response** (200):
```json
{
  "success": true,
  "weeks": [
    {
      "number": 1,
      "percentage": 80,
      "tasks": [
        {
          "id": "uuid",
          "title": "Complete onboarding paperwork",
          "description": "Fill out all HR forms and submit to HR department",
          "timeEstimate": "2 hours",
          "completed": true,
          "completedAt": "2025-01-15T14:30:00Z",
          "week": 1,
          "orderIndex": 0
        }
      ]
    },
    {
      "number": 2,
      "percentage": 40,
      "tasks": [
        {
          "id": "uuid",
          "title": "Set up development environment",
          "description": "Install Node.js, Git, VS Code, and clone repositories",
          "timeEstimate": "4 hours",
          "completed": false,
          "completedAt": null,
          "week": 2,
          "orderIndex": 0
        }
      ]
    }
  ],
  "currentWeek": 2,
  "totalWeeks": 12,
  "status": "active"
}
```

---

### PATCH /roadmaps/tasks/:id

Toggle a task's completion status.

**Status**: ✅ Implemented

**Headers**: Authorization required

**Request Body**:
```json
{
  "completed": true
}
```

**Response** (200):
```json
{
  "success": true,
  "task": {
    "id": "uuid",
    "completed": true,
    "completedAt": "2025-01-16T10:30:00Z"
  }
}
```

---

### POST /roadmaps/tasks

Add a custom task to the roadmap (admin or self-directed).

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required

**Request Body**:
```json
{
  "title": "Review codebase architecture",
  "description": "Spend time understanding the monorepo structure",
  "timeEstimate": "3 hours",
  "week": 2
}
```

**Response** (201):
```json
{
  "success": true,
  "task": {
    "id": "uuid",
    "title": "Review codebase architecture",
    "description": "Spend time understanding the monorepo structure",
    "timeEstimate": "3 hours",
    "completed": false,
    "week": 2,
    "orderIndex": 5,
    "createdAt": "2025-01-16T10:30:00Z"
  }
}
```

---

### PATCH /roadmaps/tasks/:id/reorder

Change task order within a week.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required

**Request Body**:
```json
{
  "orderIndex": 2
}
```

**Response** (200):
```json
{
  "success": true,
  "task": {
    "id": "uuid",
    "orderIndex": 2
  }
}
```

---

### DELETE /roadmaps/tasks/:id

Remove a custom task from the roadmap.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required

**Response** (200):
```json
{
  "success": true,
  "message": "Task deleted successfully"
}
```

---

### GET /roadmaps/progress

Get aggregated progress statistics.

**Status**: 🔨 Needed (Phase 3)

**Headers**: Authorization required

**Response** (200):
```json
{
  "success": true,
  "progress": {
    "overallCompletion": 65,
    "currentWeek": 2,
    "totalWeeks": 12,
    "tasksCompleted": 15,
    "tasksTotal": 23,
    "weeklyBreakdown": [
      { "week": 1, "completion": 100, "tasksCompleted": 5, "tasksTotal": 5 },
      { "week": 2, "completion": 40, "tasksCompleted": 2, "tasksTotal": 5 }
    ],
    "overdueTasks": 1,
    "upcomingTasks": 8
  }
}
```

---

## 5. Nudges (Expert Matching)

### GET /nudges

Get all active nudges for the current user.

**Status**: ✅ Implemented

**Headers**: Authorization required

**Query Parameters**:
- `status` (optional): Filter by status (waiting, accepted, declined, resolved)
- `limit` (optional): Number of nudges (default: 20)

**Response** (200):
```json
{
  "success": true,
  "nudges": [
    {
      "id": "uuid",
      "userId": "uuid",
      "expertId": "uuid",
      "expertName": "Sarah Johnson",
      "expertRole": "Senior Frontend Engineer",
      "expertAvatar": "https://...",
      "description": "Sarah can help you with React best practices",
      "context": "Based on your questions about component architecture",
      "matchScore": "0.94",
      "matchReasons": [
        "Expert in React and TypeScript",
        "Has helped 15 engineers with similar questions",
        "95% response rate"
      ],
      "status": "waiting",
      "deliveryChannel": "in_app",
      "timestamp": "2025-01-16T10:00:00Z",
      "acceptedAt": null,
      "resolvedAt": null,
      "online": true
    }
  ]
}
```

---

### POST /nudges/:id/accept

Accept a nudge recommendation.

**Status**: ✅ Implemented

**Headers**: Authorization required

**Response** (200):
```json
{
  "success": true,
  "nudge": {
    "id": "uuid",
    "status": "accepted",
    "acceptedAt": "2025-01-16T10:30:00Z"
  },
  "nextSteps": {
    "message": "Sarah has been notified. You can start a conversation in the Chats tab.",
    "conversationId": "uuid"
  }
}
```

---

### POST /nudges/:id/dismiss

Dismiss/decline a nudge.

**Status**: ✅ Implemented (as /dismiss route)

**Headers**: Authorization required

**Response** (200):
```json
{
  "success": true,
  "nudge": {
    "id": "uuid",
    "status": "declined"
  }
}
```

---

### POST /nudges/:id/resolve

Mark a nudge as resolved (after help is complete).

**Status**: ✅ Implemented

**Headers**: Authorization required

**Request Body** (optional):
```json
{
  "rating": 5,
  "feedback": "Sarah was very helpful!"
}
```

**Response** (200):
```json
{
  "success": true,
  "nudge": {
    "id": "uuid",
    "status": "resolved",
    "resolvedAt": "2025-01-16T11:00:00Z"
  }
}
```

---

### POST /nudges/request

Manually request expert help.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required

**Request Body**:
```json
{
  "topic": "React performance optimization",
  "description": "I need help understanding why my components are re-rendering too often",
  "urgency": "medium"
}
```

**Response** (201):
```json
{
  "success": true,
  "matchedExperts": [
    {
      "expertId": "uuid",
      "name": "Sarah Johnson",
      "role": "Senior Frontend Engineer",
      "matchScore": "0.94",
      "estimatedResponseTime": "< 2 hours"
    }
  ],
  "nudgeId": "uuid"
}
```

---

### GET /nudges/stats

Get nudge statistics for the user.

**Status**: 🔨 Needed (Phase 3)

**Headers**: Authorization required

**Response** (200):
```json
{
  "success": true,
  "stats": {
    "totalNudges": 25,
    "accepted": 18,
    "declined": 3,
    "resolved": 15,
    "averageResponseTime": "1.5 hours",
    "averageResolutionTime": "3 hours",
    "topExperts": [
      {
        "expertId": "uuid",
        "name": "Sarah Johnson",
        "interactions": 5,
        "avgRating": 4.8
      }
    ]
  }
}
```

---

## 6. Experts

### GET /experts

Get list of available experts.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required

**Query Parameters**:
- `topic` (optional): Filter by topic/expertise
- `available` (optional): Filter by availability (boolean)
- `limit` (optional): Number of experts (default: 20)

**Response** (200):
```json
{
  "success": true,
  "experts": [
    {
      "id": "uuid",
      "userId": "uuid",
      "name": "Sarah Johnson",
      "role": "Senior Frontend Engineer",
      "avatar": "https://...",
      "topics": ["React", "TypeScript", "Performance"],
      "availability": "available",
      "responseRate": 0.95,
      "averageRating": 4.8,
      "totalInteractions": 45,
      "online": true
    }
  ]
}
```

---

### GET /experts/:id

Get expert profile details.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required

**Response** (200):
```json
{
  "success": true,
  "expert": {
    "id": "uuid",
    "userId": "uuid",
    "name": "Sarah Johnson",
    "role": "Senior Frontend Engineer",
    "avatar": "https://...",
    "bio": "Frontend engineer with 8 years of experience...",
    "topics": ["React", "TypeScript", "Performance", "Testing"],
    "availability": "available",
    "responseRate": 0.95,
    "averageRating": 4.8,
    "totalInteractions": 45,
    "weeklyAvailability": {
      "monday": ["09:00-12:00", "14:00-17:00"],
      "tuesday": ["09:00-12:00", "14:00-17:00"]
    },
    "recentReviews": [
      {
        "rating": 5,
        "feedback": "Very helpful with React optimization!",
        "timestamp": "2025-01-15T10:00:00Z"
      }
    ]
  }
}
```

---

### POST /experts/profile

Opt-in to become an expert.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required

**Request Body**:
```json
{
  "topics": ["React", "TypeScript", "Node.js"],
  "bio": "Frontend engineer with 8 years of experience...",
  "weeklyAvailability": {
    "monday": ["09:00-12:00", "14:00-17:00"],
    "tuesday": ["09:00-12:00"]
  }
}
```

**Response** (201):
```json
{
  "success": true,
  "expertProfile": {
    "id": "uuid",
    "userId": "uuid",
    "topics": ["React", "TypeScript", "Node.js"],
    "status": "active",
    "createdAt": "2025-01-16T10:00:00Z"
  }
}
```

---

### PATCH /experts/profile

Update expert profile.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required

**Request Body** (partial update):
```json
{
  "availability": "busy",
  "topics": ["React", "TypeScript", "Node.js", "GraphQL"]
}
```

**Response** (200):
```json
{
  "success": true,
  "expertProfile": {
    "id": "uuid",
    "availability": "busy",
    "topics": ["React", "TypeScript", "Node.js", "GraphQL"],
    "updatedAt": "2025-01-16T10:30:00Z"
  }
}
```

---

## 7. Admin - Dashboard

### GET /admin/dashboard

Get admin dashboard overview metrics.

**Status**: 🔨 Needed (Phase 3)

**Headers**: Authorization required (admin role)

**Response** (200):
```json
{
  "success": true,
  "metrics": [
    {
      "label": "Active Users",
      "value": 145,
      "description": "Users with activity in last 7 days",
      "type": "count"
    },
    {
      "label": "Avg Time to Productivity",
      "value": "5.2 weeks",
      "description": "Time until first meaningful contribution",
      "type": "time"
    },
    {
      "label": "Help Resolution Rate",
      "value": "78%",
      "description": "Questions resolved without escalation",
      "type": "percentage"
    },
    {
      "label": "Cost Savings",
      "value": "$125,000",
      "description": "Estimated savings from automated help",
      "type": "currency"
    }
  ],
  "productivityData": {
    "automated": 72,
    "manual": 28
  },
  "recentActivity": [
    {
      "type": "user_joined",
      "user": "John Doe",
      "timestamp": "2025-01-16T09:00:00Z"
    }
  ]
}
```

---

### GET /admin/analytics/usage

Get detailed usage analytics.

**Status**: 🔨 Needed (Phase 3)

**Headers**: Authorization required (admin role)

**Query Parameters**:
- `startDate`: ISO date string
- `endDate`: ISO date string
- `groupBy`: day | week | month

**Response** (200):
```json
{
  "success": true,
  "usage": {
    "period": { "start": "2025-01-01", "end": "2025-01-31" },
    "helpRequests": {
      "total": 450,
      "resolved": 351,
      "escalated": 99,
      "avgResponseTime": "3.2 seconds"
    },
    "conversations": {
      "total": 320,
      "active": 145,
      "avgMessagesPerConversation": 8.5
    },
    "nudges": {
      "sent": 280,
      "accepted": 210,
      "declined": 45,
      "avgMatchScore": 0.87
    },
    "timeSeriesData": [
      { "date": "2025-01-01", "helpRequests": 15, "conversations": 10 }
    ]
  }
}
```

---

## 8. Admin - Templates

### GET /admin/templates

Get all roadmap templates.

**Status**: ✅ Implemented

**Headers**: Authorization required (admin role)

**Query Parameters**:
- `search` (optional): Search by title or description
- `roleTag` (optional): Filter by role tag
- `limit` (optional): Number of templates (default: 50)

**Response** (200):
```json
{
  "success": true,
  "templates": [
    {
      "id": "uuid",
      "organizationId": "uuid",
      "title": "Software Engineer Onboarding",
      "description": "12-week onboarding plan for new software engineers",
      "icon": "💻",
      "roleTags": ["Software Engineer", "Backend", "Frontend"],
      "totalWeeks": 12,
      "tasks": 45,
      "usedCount": 23,
      "createdAt": "2024-12-01T10:00:00Z",
      "updatedAt": "2025-01-10T14:30:00Z"
    }
  ]
}
```

---

### POST /admin/templates

Create a new roadmap template.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required (admin role)

**Request Body**:
```json
{
  "title": "Product Designer Onboarding",
  "description": "8-week onboarding plan for new product designers",
  "icon": "🎨",
  "roleTags": ["Product Designer", "UX", "UI"],
  "totalWeeks": 8
}
```

**Response** (201):
```json
{
  "success": true,
  "template": {
    "id": "uuid",
    "organizationId": "uuid",
    "title": "Product Designer Onboarding",
    "description": "8-week onboarding plan for new product designers",
    "icon": "🎨",
    "roleTags": ["Product Designer", "UX", "UI"],
    "totalWeeks": 8,
    "createdAt": "2025-01-16T10:00:00Z"
  }
}
```

---

### GET /admin/templates/:id

Get a specific template with all tasks.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required (admin role)

**Response** (200):
```json
{
  "success": true,
  "template": {
    "id": "uuid",
    "title": "Software Engineer Onboarding",
    "description": "12-week onboarding plan",
    "icon": "💻",
    "roleTags": ["Software Engineer"],
    "totalWeeks": 12,
    "tasks": [
      {
        "id": "uuid",
        "templateId": "uuid",
        "weekNumber": 1,
        "title": "Complete HR paperwork",
        "description": "Fill out all forms",
        "timeEstimate": "2 hours",
        "orderIndex": 0,
        "sourceMaterials": [
          {
            "id": "uuid",
            "title": "HR Onboarding Guide",
            "url": "https://...",
            "type": "document"
          }
        ]
      }
    ]
  }
}
```

---

### PATCH /admin/templates/:id

Update a template.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required (admin role)

**Request Body** (partial update):
```json
{
  "title": "Updated Software Engineer Onboarding",
  "description": "Enhanced 12-week plan with new AI tools training",
  "roleTags": ["Software Engineer", "Full Stack"]
}
```

**Response** (200):
```json
{
  "success": true,
  "template": {
    "id": "uuid",
    "title": "Updated Software Engineer Onboarding",
    "description": "Enhanced 12-week plan with new AI tools training",
    "updatedAt": "2025-01-16T10:30:00Z"
  }
}
```

---

### DELETE /admin/templates/:id

Delete a template.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required (admin role)

**Response** (200):
```json
{
  "success": true,
  "message": "Template deleted successfully"
}
```

---

### POST /admin/templates/:id/tasks

Add a task to a template.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required (admin role)

**Request Body**:
```json
{
  "weekNumber": 2,
  "title": "Set up local development environment",
  "description": "Install Node.js, Git, VS Code, and clone repos",
  "timeEstimate": "4 hours",
  "orderIndex": 0,
  "sourceMaterialIds": ["uuid1", "uuid2"]
}
```

**Response** (201):
```json
{
  "success": true,
  "task": {
    "id": "uuid",
    "templateId": "uuid",
    "weekNumber": 2,
    "title": "Set up local development environment",
    "orderIndex": 0,
    "createdAt": "2025-01-16T10:30:00Z"
  }
}
```

---

### PATCH /admin/templates/:templateId/tasks/:taskId

Update a template task.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required (admin role)

**Request Body**:
```json
{
  "title": "Updated task title",
  "weekNumber": 3,
  "orderIndex": 1
}
```

**Response** (200):
```json
{
  "success": true,
  "task": {
    "id": "uuid",
    "title": "Updated task title",
    "weekNumber": 3,
    "orderIndex": 1,
    "updatedAt": "2025-01-16T10:30:00Z"
  }
}
```

---

### DELETE /admin/templates/:templateId/tasks/:taskId

Delete a template task.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required (admin role)

**Response** (200):
```json
{
  "success": true,
  "message": "Task deleted successfully"
}
```

---

### POST /admin/templates/:id/assign

Assign a template to a user.

**Status**: 🔨 Needed (Phase 2 - HIGH PRIORITY)

**Headers**: Authorization required (admin role)

**Request Body**:
```json
{
  "userId": "uuid",
  "startDate": "2025-01-20"
}
```

**Response** (200):
```json
{
  "success": true,
  "assignment": {
    "id": "uuid",
    "userId": "uuid",
    "templateId": "uuid",
    "assignedAt": "2025-01-16T10:30:00Z",
    "status": "active"
  },
  "tasksCreated": 45
}
```

---

### POST /admin/templates/:id/duplicate

Duplicate a template.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required (admin role)

**Response** (201):
```json
{
  "success": true,
  "template": {
    "id": "uuid",
    "title": "Software Engineer Onboarding (Copy)",
    "createdAt": "2025-01-16T10:30:00Z"
  }
}
```

---

## 9. Admin - People Management

### GET /admin/users

Get all users in the organization.

**Status**: ✅ Implemented

**Headers**: Authorization required (admin role)

**Query Parameters**:
- `search` (optional): Search by name or email
- `role` (optional): Filter by role (admin, employee)
- `status` (optional): Filter by onboarding status
- `limit` (optional): Number of users (default: 50)
- `offset` (optional): Pagination offset

**Response** (200):
```json
{
  "users": [
    {
      "id": "uuid",
      "name": "John Doe",
      "email": "john.doe@company.com",
      "role": "employee",
      "startDate": "2025-01-15",
      "status": "Onboarding",
      "progress": 45,
      "avatarUrl": "https://..."
    }
  ]
}
```

---

### GET /admin/users/:id

Get detailed information about a specific user.

**Status**: ✅ Implemented

**Headers**: Authorization required (admin role)

**Response** (200):
```json
{
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "role": "employee",
    "startDate": "2025-01-15",
    "status": "Onboarding",
    "progress": 45,
    "manager": null,
    "metrics": {
      "totalTasks": 45,
      "completedTasks": 20,
      "overdueTasks": 2
    },
    "assignedRoadmaps": [
      {
        "id": "uuid",
        "title": "Software Engineer Onboarding",
        "description": "12-week onboarding plan",
        "tasks": 45,
        "completion": 45
      }
    ],
    "conversations": [
      {
        "id": "uuid",
        "timestamp": "2 hours ago",
        "question": "How to set up my dev environment?",
        "status": "resolved"
      }
    ],
    "nudgeThemes": [
      {
        "theme": "React best practices",
        "count": 3,
        "nudges": [
          {
            "name": "Sarah Johnson",
            "count": 2
          }
        ]
      }
    ],
    "activityData": [
      { "date": "Oct 13", "hours": 0 },
      { "date": "Yesterday", "hours": 0 },
      { "date": "Today", "hours": 0 }
    ]
  }
}
```

---

### PATCH /admin/users/:id

Update user information.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required (admin role)

**Request Body**:
```json
{
  "firstName": "Jane",
  "role": "admin",
  "startDate": "2025-01-20"
}
```

**Response** (200):
```json
{
  "success": true,
  "person": {
    "id": "uuid",
    "firstName": "Jane",
    "role": "admin",
    "startDate": "2025-01-20",
    "updatedAt": "2025-01-16T10:30:00Z"
  }
}
```

---

### POST /admin/users/:id/assign-template

Assign a template to a user (same as POST /admin/templates/:id/assign).

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required (admin role)

**Request Body**:
```json
{
  "templateId": "uuid",
  "startDate": "2025-01-20"
}
```

**Response** (200):
```json
{
  "success": true,
  "assignment": {
    "id": "uuid",
    "userId": "uuid",
    "templateId": "uuid",
    "assignedAt": "2025-01-16T10:30:00Z",
    "status": "active"
  }
}
```

---

### DELETE /admin/users/:id

Deactivate a user.

**Status**: 🔨 Needed (Phase 3)

**Headers**: Authorization required (admin role)

**Response** (200):
```json
{
  "success": true,
  "message": "User deactivated successfully"
}
```

---

### POST /admin/users/invite

Invite a new user to the organization.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required (admin role)

**Request Body**:
```json
{
  "email": "newuser@company.com",
  "firstName": "Jane",
  "lastName": "Smith",
  "role": "employee",
  "templateId": "uuid",
  "startDate": "2025-02-01"
}
```

**Response** (201):
```json
{
  "success": true,
  "invitation": {
    "id": "uuid",
    "email": "newuser@company.com",
    "invitedBy": "uuid",
    "expiresAt": "2025-02-01T00:00:00Z",
    "createdAt": "2025-01-16T10:30:00Z"
  },
  "message": "Invitation sent to newuser@company.com"
}
```

---

## 10. Admin - Integrations

### GET /admin/integrations

Get all integration configurations.

**Status**: ✅ Implemented

**Headers**: Authorization required (admin role)

**Response** (200):
```json
{
  "success": true,
  "integrations": [
    {
      "id": "uuid",
      "provider": "slack",
      "name": "Slack Workspace",
      "description": "Send nudges and notifications via Slack",
      "logoUrl": "https://...",
      "status": "connected",
      "updatesPerDay": 45,
      "connectedAt": "2025-01-10T10:00:00Z",
      "configuration": {
        "webhookUrl": "https://hooks.slack.com/...",
        "channelId": "C123456"
      }
    }
  ]
}
```

---

### POST /admin/integrations

Add a new integration.

**Status**: 🔨 Needed (Phase 3)

**Headers**: Authorization required (admin role)

**Request Body**:
```json
{
  "provider": "notion",
  "configuration": {
    "apiKey": "secret_xxx",
    "workspaceId": "workspace_xxx"
  }
}
```

**Response** (201):
```json
{
  "success": true,
  "integration": {
    "id": "uuid",
    "provider": "notion",
    "status": "pending",
    "createdAt": "2025-01-16T10:30:00Z"
  }
}
```

---

### PATCH /admin/integrations/:id

Update integration configuration.

**Status**: 🔨 Needed (Phase 3)

**Headers**: Authorization required (admin role)

**Request Body**:
```json
{
  "status": "disconnected",
  "configuration": {
    "webhookUrl": "https://hooks.slack.com/updated"
  }
}
```

**Response** (200):
```json
{
  "success": true,
  "integration": {
    "id": "uuid",
    "status": "disconnected",
    "updatedAt": "2025-01-16T10:30:00Z"
  }
}
```

---

### DELETE /admin/integrations/:id

Remove an integration.

**Status**: 🔨 Needed (Phase 3)

**Headers**: Authorization required (admin role)

**Response** (200):
```json
{
  "success": true,
  "message": "Integration removed successfully"
}
```

---

### POST /admin/integrations/:id/test

Test integration connection.

**Status**: 🔨 Needed (Phase 3)

**Headers**: Authorization required (admin role)

**Response** (200):
```json
{
  "success": true,
  "status": "connection_successful",
  "message": "Successfully connected to Slack workspace",
  "details": {
    "workspaceName": "Acme Corp",
    "channelCount": 45,
    "memberCount": 150
  }
}
```

---

## 11. Admin - Analytics

### GET /admin/analytics/overview

Get high-level analytics overview.

**Status**: 🔨 Needed (Phase 3)

**Headers**: Authorization required (admin role)

**Query Parameters**:
- `startDate`: ISO date string
- `endDate`: ISO date string

**Response** (200):
```json
{
  "success": true,
  "analytics": {
    "period": { "start": "2025-01-01", "end": "2025-01-31" },
    "users": {
      "total": 145,
      "active": 120,
      "newThisMonth": 15
    },
    "helpSystem": {
      "questionsAsked": 450,
      "questionsResolved": 351,
      "resolutionRate": 0.78,
      "avgResponseTime": "3.2 seconds"
    },
    "nudges": {
      "sent": 280,
      "acceptanceRate": 0.75,
      "avgMatchScore": 0.87
    },
    "onboarding": {
      "avgTimeToProductivity": "5.2 weeks",
      "completionRate": 0.85
    },
    "costSavings": {
      "estimatedSavings": 125000,
      "automatedInteractions": 351,
      "manualInteractions": 99
    }
  }
}
```

---

### GET /admin/analytics/users

Get user-level analytics.

**Status**: 🔨 Needed (Phase 3)

**Headers**: Authorization required (admin role)

**Response** (200):
```json
{
  "success": true,
  "userAnalytics": [
    {
      "userId": "uuid",
      "name": "John Doe",
      "startDate": "2025-01-15",
      "currentWeek": 2,
      "roadmapProgress": 45,
      "helpRequestCount": 8,
      "nudgesAccepted": 3,
      "activityScore": 85,
      "timeToFirstContribution": "1.5 weeks",
      "riskLevel": "low"
    }
  ]
}
```

---

### GET /admin/analytics/content

Get content effectiveness analytics.

**Status**: 🔨 Needed (Phase 3)

**Headers**: Authorization required (admin role)

**Response** (200):
```json
{
  "success": true,
  "contentAnalytics": {
    "topDocuments": [
      {
        "documentId": "uuid",
        "title": "Dev Setup Guide",
        "views": 145,
        "helpfulnessRating": 4.7,
        "avgTimeOnPage": "5.2 minutes",
        "retrieval_count": 89
      }
    ],
    "gaps": [
      {
        "topic": "CI/CD pipeline troubleshooting",
        "questionCount": 25,
        "resolutionRate": 0.45,
        "suggestion": "Consider adding documentation on CI/CD debugging"
      }
    ]
  }
}
```

---

### GET /admin/analytics/experts

Get expert performance analytics.

**Status**: 🔨 Needed (Phase 3)

**Headers**: Authorization required (admin role)

**Response** (200):
```json
{
  "success": true,
  "expertAnalytics": [
    {
      "expertId": "uuid",
      "name": "Sarah Johnson",
      "totalInteractions": 45,
      "responseRate": 0.95,
      "avgResponseTime": "1.2 hours",
      "avgResolutionTime": "2.8 hours",
      "avgRating": 4.8,
      "topics": ["React", "TypeScript"],
      "impactScore": 92
    }
  ]
}
```

---

## 12. Organizations

### GET /organizations/:id

Get organization details.

**Status**: 🔨 Needed (Phase 3)

**Headers**: Authorization required

**Response** (200):
```json
{
  "success": true,
  "organization": {
    "id": "uuid",
    "name": "Acme Corp",
    "domain": "acme.com",
    "logoUrl": "https://...",
    "settings": {
      "onboardingDuration": 12,
      "workingHours": { "start": "09:00", "end": "17:00" },
      "timezone": "America/New_York"
    },
    "memberCount": 145,
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

---

### PATCH /organizations/:id

Update organization settings.

**Status**: 🔨 Needed (Phase 3)

**Headers**: Authorization required (admin role)

**Request Body**:
```json
{
  "settings": {
    "onboardingDuration": 16,
    "workingHours": { "start": "08:00", "end": "18:00" }
  }
}
```

**Response** (200):
```json
{
  "success": true,
  "organization": {
    "id": "uuid",
    "settings": {
      "onboardingDuration": 16,
      "workingHours": { "start": "08:00", "end": "18:00" }
    },
    "updatedAt": "2025-01-16T10:30:00Z"
  }
}
```

---

## 13. Source Materials

### GET /admin/source-materials

Get all source materials (documents, videos, etc.).

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required (admin role)

**Query Parameters**:
- `type` (optional): Filter by type (document, video, link, etc.)
- `search` (optional): Search by title
- `limit` (optional): Number of materials (default: 50)

**Response** (200):
```json
{
  "success": true,
  "materials": [
    {
      "id": "uuid",
      "organizationId": "uuid",
      "title": "Development Environment Setup Guide",
      "description": "Step-by-step guide for setting up local dev environment",
      "type": "document",
      "url": "https://docs.company.com/dev-setup",
      "tags": ["development", "setup", "onboarding"],
      "usageCount": 45,
      "helpfulnessRating": 4.7,
      "createdAt": "2024-12-01T10:00:00Z",
      "updatedAt": "2025-01-10T14:30:00Z"
    }
  ]
}
```

---

### POST /admin/source-materials

Add a new source material.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required (admin role)

**Request Body**:
```json
{
  "title": "React Best Practices Video",
  "description": "Video tutorial on React component architecture",
  "type": "video",
  "url": "https://youtube.com/...",
  "tags": ["react", "frontend", "best-practices"]
}
```

**Response** (201):
```json
{
  "success": true,
  "material": {
    "id": "uuid",
    "organizationId": "uuid",
    "title": "React Best Practices Video",
    "type": "video",
    "url": "https://youtube.com/...",
    "createdAt": "2025-01-16T10:30:00Z"
  }
}
```

---

### PATCH /admin/source-materials/:id

Update source material.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required (admin role)

**Request Body**:
```json
{
  "title": "Updated React Best Practices",
  "tags": ["react", "frontend", "best-practices", "2025"]
}
```

**Response** (200):
```json
{
  "success": true,
  "material": {
    "id": "uuid",
    "title": "Updated React Best Practices",
    "tags": ["react", "frontend", "best-practices", "2025"],
    "updatedAt": "2025-01-16T10:30:00Z"
  }
}
```

---

### DELETE /admin/source-materials/:id

Delete source material.

**Status**: 🔨 Needed (Phase 2)

**Headers**: Authorization required (admin role)

**Response** (200):
```json
{
  "success": true,
  "message": "Source material deleted successfully"
}
```

---

### POST /admin/source-materials/upload

Upload a document file.

**Status**: 🔨 Needed (Phase 2)

**Headers**:
- Authorization required (admin role)
- Content-Type: multipart/form-data

**Request Body**: FormData with:
- `file`: Document file (PDF, DOCX, etc.)
- `title`: Document title
- `description`: Document description
- `tags`: JSON array of tags

**Response** (201):
```json
{
  "success": true,
  "material": {
    "id": "uuid",
    "title": "Engineering Handbook",
    "type": "document",
    "url": "https://storage.supabase.co/...",
    "fileSize": 2456789,
    "createdAt": "2025-01-16T10:30:00Z"
  }
}
```

---

## Error Handling

All endpoints follow consistent error response format:

### 400 Bad Request
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": [
      {
        "field": "email",
        "message": "Email is required"
      }
    ]
  }
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Admin role required for this action"
  }
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "resourceType": "conversation",
    "resourceId": "uuid"
  }
}
```

### 409 Conflict
```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "User with this email already exists"
  }
}
```

### 429 Too Many Requests
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "retryAfter": 60
  }
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred",
    "requestId": "req_abc123"
  }
}
```

---

## Implementation Phases

### Phase 1 (Weeks 1-4) - MVP Core Help System
**Priority**: HIGH

**Endpoints Implemented**:
- ✅ POST /auth/signup
- ✅ POST /auth/login
- ✅ POST /auth/logout
- ✅ POST /auth/refresh
- ✅ GET /auth/me
- ✅ GET /conversations
- ✅ POST /conversations
- ✅ GET /conversations/:id/messages
- ✅ POST /conversations/:id/messages
- ✅ GET /roadmaps
- ✅ PATCH /roadmaps/tasks/:id
- ✅ GET /nudges
- ✅ POST /nudges/:id/accept
- ✅ POST /nudges/:id/dismiss
- ✅ POST /nudges/:id/resolve
- ✅ GET /admin/users
- ✅ GET /admin/users/:id
- ✅ GET /admin/templates
- ✅ GET /admin/integrations

**Endpoints to Implement**:
- 🔨 **POST /conversations/:id/screenshot** - CRITICAL for Cmd+H flow

**Dependencies**:
- Gemini Vision API integration
- Screenshot capture functionality
- Overlay window coordination
- Knowledge base setup (Pinecone + PostgreSQL FTS)

---

### Phase 2 (Weeks 5-8) - Roadmap & Nudges Enhancement
**Priority**: MEDIUM-HIGH

**Endpoints to Implement**:
- 🔨 POST /roadmaps/tasks (custom tasks)
- 🔨 POST /admin/templates (create template)
- 🔨 PATCH /admin/templates/:id (edit template)
- 🔨 DELETE /admin/templates/:id (delete template)
- 🔨 POST /admin/templates/:id/tasks (add template tasks)
- 🔨 PATCH /admin/templates/:templateId/tasks/:taskId (update template task)
- 🔨 DELETE /admin/templates/:templateId/tasks/:taskId (delete template task)
- 🔨 **POST /admin/templates/:id/assign** - CRITICAL for template system
- 🔨 GET /experts (list experts)
- 🔨 GET /experts/:id (expert details)
- 🔨 POST /experts/profile (become expert)
- 🔨 PATCH /experts/profile (update expert profile)
- 🔨 POST /nudges/request (manual expert requests)
- 🔨 PATCH /admin/users/:id (update user)
- 🔨 POST /admin/users/:id/assign-template (assign template to user)
- 🔨 POST /admin/users/invite (invite user)
- 🔨 GET /admin/source-materials
- 🔨 POST /admin/source-materials
- 🔨 PATCH /admin/source-materials/:id
- 🔨 DELETE /admin/source-materials/:id
- 🔨 POST /admin/source-materials/upload

**Dependencies**:
- Template assignment workflow
- Expert matching algorithm
- Source material management

---

### Phase 3 (Weeks 9-12) - Admin Dashboard & Analytics
**Priority**: MEDIUM

**Endpoints to Implement**:
- 🔨 GET /admin/dashboard (dashboard metrics)
- 🔨 GET /admin/analytics/usage
- 🔨 GET /admin/analytics/overview
- 🔨 GET /admin/analytics/users
- 🔨 GET /admin/analytics/content
- 🔨 GET /admin/analytics/experts
- 🔨 POST /admin/integrations (add integration)
- 🔨 PATCH /admin/integrations/:id (update integration)
- 🔨 DELETE /admin/integrations/:id (remove integration)
- 🔨 POST /admin/integrations/:id/test (test connection)
- 🔨 GET /roadmaps/progress (detailed progress stats)
- 🔨 GET /nudges/stats (nudge statistics)
- 🔨 DELETE /admin/users/:id (deactivate user)

**Dependencies**:
- Analytics data aggregation pipelines
- Integration OAuth flows
- Background job processing

---

### Phase 4 (Weeks 13-16) - Scale & Polish
**Priority**: LOW

**Endpoints to Implement**:
- 🔨 PATCH /auth/me (profile updates)
- 🔨 POST /auth/me/avatar (avatar upload)
- 🔨 GET /organizations/:id (organization details)
- 🔨 PATCH /organizations/:id (update organization)
- 🔨 PATCH /conversations/:id (update conversation)
- 🔨 DELETE /conversations/:id (archive conversation)
- 🔨 POST /admin/templates/:id/duplicate (duplicate template)
- 🔨 PATCH /roadmaps/tasks/:id/reorder (reorder task)
- 🔨 DELETE /roadmaps/tasks/:id (delete custom task)
- Rate limiting middleware
- Request logging and monitoring
- Performance optimization

**Dependencies**:
- Load testing results
- User feedback incorporation
- Production monitoring setup

---

## Notes

1. **Rate Limiting**: All endpoints should implement rate limiting (e.g., 100 requests/minute per user, 500 requests/minute per organization)

2. **Pagination**: Endpoints returning lists should support `limit` and `offset` (or cursor-based pagination for large datasets)

3. **Filtering & Sorting**: Admin list endpoints should support filtering, sorting, and search

4. **Webhooks**: Consider webhook support for integrations in Phase 3 (e.g., notify external systems when nudges are sent)

5. **Real-time Updates**: Consider WebSocket or Server-Sent Events for real-time updates in conversations and nudges (Phase 3)

6. **File Uploads**: Use Supabase Storage for avatar uploads, source material documents, and screenshots

7. **Caching**: Implement caching for frequently accessed data (e.g., organization settings, templates)

8. **Security**:
   - All endpoints require authentication except /auth/signup and /auth/login
   - Admin endpoints require role-based access control (RBAC)
   - Input validation and sanitization on all endpoints
   - SQL injection prevention via Drizzle ORM parameterized queries

9. **AI Pipeline**: The screenshot analysis endpoint (POST /conversations/:id/screenshot) is the most complex and critical endpoint, requiring coordination between:
   - Gemini Vision (UI object detection)
   - Gemini (intent analysis + response generation)
   - Pinecone (semantic search)
   - PostgreSQL (keyword search)
   - Response streaming for real-time updates

10. **Testing**: All endpoints should have unit tests, integration tests, and E2E tests where applicable
