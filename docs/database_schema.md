# Database Schema Documentation

Complete PostgreSQL schema for Mitable AI Onboarding Buddy.

## Table of Contents
- [Entity Relationship Overview](#entity-relationship-overview)
- [Core Tables](#core-tables)
- [Expert System Tables](#expert-system-tables)
- [Conversation Tables](#conversation-tables)
- [Roadmap Tables](#roadmap-tables)
- [Analytics Tables](#analytics-tables)
- [Indexes](#indexes)
- [Migration Files](#migration-files)
- [Sample Queries](#sample-queries)

---

## Entity Relationship Overview

```
organizations
    ├── users
    ├── integrations
    │   └── sync_logs
    └── source_materials

users
    ├── expert_profiles
    │   └── expert_topics
    ├── expert_interactions (as expert or requester)
    ├── nudges
    ├── conversations
    │   └── messages
    │       └── message_sources
    └── roadmaps
        └── roadmap_tasks
            └── task_sources → source_materials

analytics_events → users
```

---

## Core Tables

### organizations

Represents companies/organizations using Mitable.

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255), -- e.g., "acme.com" for email matching
  settings JSONB DEFAULT '{}', -- company-wide settings
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_organizations_domain ON organizations(domain);
```

**Example:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Acme Inc",
  "domain": "acme.com",
  "settings": {
    "nudge_frequency": "daily",
    "default_roadmap_weeks": 12
  }
}
```

---

### users

All users (admins and employees) in the system.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'employee')),
  avatar_url VARCHAR(500),
  current_week INTEGER DEFAULT 1, -- Current onboarding week
  start_date DATE, -- Employee start date
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

**Example:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "organization_id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "john.doe@acme.com",
  "first_name": "John",
  "last_name": "Doe",
  "role": "employee",
  "current_week": 3,
  "start_date": "2025-09-01"
}
```

---

### integrations

Connected third-party services (Slack, Notion, GitHub, Google Drive).

```sql
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('slack', 'notion', 'github', 'google-drive')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('connected', 'disconnected', 'pending', 'error')),
  access_token TEXT, -- Encrypted in production
  refresh_token TEXT, -- Encrypted in production
  token_expires_at TIMESTAMP,
  metadata JSONB DEFAULT '{}', -- Provider-specific config
  last_synced_at TIMESTAMP,
  sync_frequency INTERVAL DEFAULT '6 hours', -- How often to sync
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(organization_id, provider) -- One integration per provider per org
);

CREATE INDEX idx_integrations_org_provider ON integrations(organization_id, provider);
CREATE INDEX idx_integrations_status ON integrations(status);
```

**Metadata Examples:**

Slack:
```json
{
  "workspace_name": "Acme Workspace",
  "bot_user_id": "U01ABC123",
  "channels": ["C01XYZ", "C02ABC"]
}
```

Notion:
```json
{
  "workspace_id": "abc123",
  "workspace_name": "Acme Notion"
}
```

---

### sync_logs

Tracks synchronization history for each integration.

```sql
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'failed', 'in_progress')),
  items_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_sync_logs_integration ON sync_logs(integration_id);
CREATE INDEX idx_sync_logs_status ON sync_logs(status);
```

---

## Expert System Tables

### expert_profiles

Metadata about users who can help others (experts).

```sql
CREATE TABLE expert_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  expertise_summary TEXT, -- Auto-generated summary of expertise
  response_rate DECIMAL(5,2) DEFAULT 0.00 CHECK (response_rate BETWEEN 0 AND 100), -- Percentage
  avg_response_time INTERVAL, -- Average time to first response
  avg_resolution_time INTERVAL, -- Average time to resolve
  helpfulness_score DECIMAL(3,2) DEFAULT 0.00 CHECK (helpfulness_score BETWEEN 0 AND 5), -- 0.0 to 5.0
  total_interactions INTEGER DEFAULT 0,
  last_active_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_expert_profiles_helpfulness ON expert_profiles(helpfulness_score DESC);
CREATE INDEX idx_expert_profiles_response_rate ON expert_profiles(response_rate DESC);
```

---

### expert_topics

Specific areas of expertise for each expert.

```sql
CREATE TABLE expert_topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES expert_profiles(user_id) ON DELETE CASCADE,
  topic VARCHAR(255) NOT NULL, -- e.g., "React", "Database Design", "Deployment"
  confidence_score DECIMAL(3,2) DEFAULT 0.00 CHECK (confidence_score BETWEEN 0 AND 1), -- 0.0 to 1.0
  evidence_count INTEGER DEFAULT 0, -- How many times helped with this topic
  last_evidence_at TIMESTAMP, -- Last time they helped with this
  source VARCHAR(50) CHECK (source IN ('inferred', 'manual', 'interaction')), -- How we learned it
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, topic)
);

CREATE INDEX idx_expert_topics_user ON expert_topics(user_id);
CREATE INDEX idx_expert_topics_topic ON expert_topics(topic);
CREATE INDEX idx_expert_topics_confidence ON expert_topics(confidence_score DESC);
```

**Example:**
```json
{
  "user_id": "expert-123",
  "topic": "React Hooks",
  "confidence_score": 0.92,
  "evidence_count": 15,
  "source": "interaction"
}
```

---

### expert_interactions

Tracks when experts help requesters (collaboration graph in SQL).

```sql
CREATE TABLE expert_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expert_id UUID NOT NULL REFERENCES users(id),
  requester_id UUID NOT NULL REFERENCES users(id),
  topic VARCHAR(255),
  channel VARCHAR(50) CHECK (channel IN ('in_app', 'slack', 'email')),
  question_summary TEXT,
  status VARCHAR(50) NOT NULL CHECK (status IN ('waiting', 'responded', 'resolved', 'declined')),
  response_time INTERVAL, -- Time to first response
  resolution_time INTERVAL, -- Time to mark resolved
  helpfulness_rating INTEGER CHECK (helpfulness_rating BETWEEN 1 AND 5),
  created_at TIMESTAMP DEFAULT NOW(),
  responded_at TIMESTAMP,
  resolved_at TIMESTAMP
);

CREATE INDEX idx_expert_interactions_expert ON expert_interactions(expert_id);
CREATE INDEX idx_expert_interactions_requester ON expert_interactions(requester_id);
CREATE INDEX idx_expert_interactions_topic ON expert_interactions(topic);
CREATE INDEX idx_expert_interactions_status ON expert_interactions(status);
```

---

### nudges

Suggested expert matches shown to users.

```sql
CREATE TABLE nudges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Recipient
  expert_id UUID NOT NULL REFERENCES users(id), -- Recommended expert
  context TEXT, -- What the user was doing
  question TEXT, -- User's question/need
  match_score DECIMAL(3,2) CHECK (match_score BETWEEN 0 AND 1), -- 0.0 to 1.0
  match_reasons JSONB DEFAULT '[]', -- Why this expert was chosen
  status VARCHAR(50) DEFAULT 'waiting' CHECK (status IN ('waiting', 'accepted', 'declined', 'resolved')),
  delivery_channel VARCHAR(50) CHECK (delivery_channel IN ('in_app', 'slack', 'email')),
  delivered_at TIMESTAMP,
  accepted_at TIMESTAMP,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_nudges_user ON nudges(user_id);
CREATE INDEX idx_nudges_expert ON nudges(expert_id);
CREATE INDEX idx_nudges_status ON nudges(status);
```

**match_reasons Example:**
```json
[
  {"reason": "expertise_match", "score": 0.85, "detail": "Expert in React Hooks"},
  {"reason": "high_response_rate", "score": 0.95, "detail": "95% response rate"},
  {"reason": "availability", "score": 0.80, "detail": "Currently active"}
]
```

---

## Conversation Tables

### conversations

Chat sessions between user and AI assistant.

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255), -- Auto-generated from first message
  context_type VARCHAR(50) CHECK (context_type IN ('general', 'help_request', 'workflow')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_created ON conversations(created_at DESC);
```

---

### messages

Individual messages within conversations.

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text' CHECK (message_type IN ('text', 'workflow', 'experts')),
  card_data JSONB, -- Optional metadata for special message types
  sources JSONB DEFAULT '[]', -- Array of citation objects for RAG
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
```

**sources Example (RAG citations):**
```json
[
  {
    "type": "slack",
    "channel": "#engineering",
    "author": "Jane Doe",
    "timestamp": "2025-10-10T14:30:00Z",
    "url": "https://acme.slack.com/archives/C123/p1234567890",
    "snippet": "To deploy, run npm run build...",
    "relevance_score": 0.89
  }
]
```

---

## Roadmap Tables

### roadmaps

Onboarding plans assigned to employees.

```sql
CREATE TABLE roadmaps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(255), -- Job role (e.g., "Frontend Engineer")
  total_weeks INTEGER NOT NULL DEFAULT 12,
  current_week INTEGER DEFAULT 1,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id) -- One active roadmap per user
);

CREATE INDEX idx_roadmaps_user ON roadmaps(user_id);
CREATE INDEX idx_roadmaps_status ON roadmaps(status);
```

---

### roadmap_tasks

Individual tasks within roadmaps.

```sql
CREATE TABLE roadmap_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  roadmap_id UUID NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL CHECK (week_number > 0),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  time_estimate VARCHAR(50), -- e.g., "2 hours", "1 day"
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP,
  order_index INTEGER DEFAULT 0, -- For sorting within week
  dependencies JSONB DEFAULT '[]', -- Array of task IDs that must be done first
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_roadmap_tasks_roadmap ON roadmap_tasks(roadmap_id);
CREATE INDEX idx_roadmap_tasks_week ON roadmap_tasks(week_number);
CREATE INDEX idx_roadmap_tasks_completed ON roadmap_tasks(completed);
```

**dependencies Example:**
```json
["task-uuid-1", "task-uuid-2"]
```

---

### source_materials

Learning resources (docs, videos, tutorials).

```sql
CREATE TABLE source_materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50) CHECK (type IN ('document', 'video', 'tutorial', 'code_sample', 'link')),
  url VARCHAR(500),
  description TEXT,
  organization_id UUID REFERENCES organizations(id), -- NULL for global resources
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_source_materials_type ON source_materials(type);
CREATE INDEX idx_source_materials_org ON source_materials(organization_id);
```

---

### task_sources

Many-to-many relationship between tasks and source materials.

```sql
CREATE TABLE task_sources (
  task_id UUID NOT NULL REFERENCES roadmap_tasks(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES source_materials(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, source_id)
);

CREATE INDEX idx_task_sources_task ON task_sources(task_id);
CREATE INDEX idx_task_sources_source ON task_sources(source_id);
```

---

## Analytics Tables

### analytics_events

Tracks user actions for insights and metrics.

```sql
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL, -- e.g., "help_requested", "task_completed"
  event_data JSONB DEFAULT '{}', -- Flexible event metadata
  session_id UUID, -- For grouping related events
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_org ON analytics_events(organization_id);
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_created ON analytics_events(created_at DESC);
```

**Event Examples:**

Help requested:
```json
{
  "event_type": "help_requested",
  "event_data": {
    "question": "How do I deploy?",
    "context": "Looking at deployment docs",
    "resolution_time_seconds": 120
  }
}
```

Task completed:
```json
{
  "event_type": "task_completed",
  "event_data": {
    "task_id": "uuid-123",
    "week": 3,
    "time_taken_minutes": 45
  }
}
```

---

## Indexes

All critical indexes for performance:

```sql
-- Organizations
CREATE INDEX idx_organizations_domain ON organizations(domain);

-- Users
CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Integrations
CREATE INDEX idx_integrations_org_provider ON integrations(organization_id, provider);
CREATE INDEX idx_integrations_status ON integrations(status);
CREATE INDEX idx_sync_logs_integration ON sync_logs(integration_id);
CREATE INDEX idx_sync_logs_status ON sync_logs(status);

-- Expert System
CREATE INDEX idx_expert_profiles_helpfulness ON expert_profiles(helpfulness_score DESC);
CREATE INDEX idx_expert_profiles_response_rate ON expert_profiles(response_rate DESC);
CREATE INDEX idx_expert_topics_user ON expert_topics(user_id);
CREATE INDEX idx_expert_topics_topic ON expert_topics(topic);
CREATE INDEX idx_expert_topics_confidence ON expert_topics(confidence_score DESC);
CREATE INDEX idx_expert_interactions_expert ON expert_interactions(expert_id);
CREATE INDEX idx_expert_interactions_requester ON expert_interactions(requester_id);
CREATE INDEX idx_expert_interactions_topic ON expert_interactions(topic);
CREATE INDEX idx_expert_interactions_status ON expert_interactions(status);
CREATE INDEX idx_nudges_user ON nudges(user_id);
CREATE INDEX idx_nudges_expert ON nudges(expert_id);
CREATE INDEX idx_nudges_status ON nudges(status);

-- Conversations
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_created ON conversations(created_at DESC);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);

-- Roadmaps
CREATE INDEX idx_roadmaps_user ON roadmaps(user_id);
CREATE INDEX idx_roadmaps_status ON roadmaps(status);
CREATE INDEX idx_roadmap_tasks_roadmap ON roadmap_tasks(roadmap_id);
CREATE INDEX idx_roadmap_tasks_week ON roadmap_tasks(week_number);
CREATE INDEX idx_roadmap_tasks_completed ON roadmap_tasks(completed);
CREATE INDEX idx_source_materials_type ON source_materials(type);
CREATE INDEX idx_source_materials_org ON source_materials(organization_id);
CREATE INDEX idx_task_sources_task ON task_sources(task_id);
CREATE INDEX idx_task_sources_source ON task_sources(source_id);

-- Analytics
CREATE INDEX idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_org ON analytics_events(organization_id);
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_created ON analytics_events(created_at DESC);
```

---

## Migration Files

Organize migrations by functional area:

```
apps/backend/src/db/migrations/
├── 001_initial_schema.sql          # Organizations, users, integrations
├── 002_expert_system.sql           # Expert profiles, topics, interactions, nudges
├── 003_conversations.sql           # Conversations and messages
├── 004_roadmaps.sql                # Roadmaps, tasks, source materials
├── 005_analytics.sql               # Analytics events
└── 006_indexes.sql                 # All performance indexes
```

Each migration should:
1. Start with `BEGIN;`
2. Use `IF NOT EXISTS` for idempotency
3. End with `COMMIT;`
4. Include rollback instructions in comments

---

## Sample Queries

### Find top experts for a topic

```sql
SELECT
  u.id,
  u.first_name,
  u.last_name,
  et.topic,
  et.confidence_score,
  ep.helpfulness_score,
  ep.response_rate
FROM expert_topics et
JOIN expert_profiles ep ON et.user_id = ep.user_id
JOIN users u ON ep.user_id = u.id
WHERE et.topic ILIKE '%React%'
  AND ep.response_rate > 70
ORDER BY et.confidence_score DESC, ep.helpfulness_score DESC
LIMIT 5;
```

### Get user's current roadmap progress

```sql
SELECT
  r.current_week,
  r.total_weeks,
  COUNT(rt.id) FILTER (WHERE rt.completed = TRUE) as completed_tasks,
  COUNT(rt.id) as total_tasks,
  ROUND(100.0 * COUNT(rt.id) FILTER (WHERE rt.completed = TRUE) / NULLIF(COUNT(rt.id), 0), 2) as completion_percentage
FROM roadmaps r
LEFT JOIN roadmap_tasks rt ON r.id = rt.roadmap_id
WHERE r.user_id = $1
GROUP BY r.id, r.current_week, r.total_weeks;
```

### Track expert performance over time

```sql
SELECT
  ei.expert_id,
  u.first_name,
  u.last_name,
  COUNT(*) as total_interactions,
  AVG(ei.helpfulness_rating) as avg_rating,
  AVG(EXTRACT(EPOCH FROM ei.response_time) / 3600) as avg_response_hours
FROM expert_interactions ei
JOIN users u ON ei.expert_id = u.id
WHERE ei.created_at > NOW() - INTERVAL '30 days'
  AND ei.status = 'resolved'
GROUP BY ei.expert_id, u.first_name, u.last_name
ORDER BY avg_rating DESC, avg_response_hours ASC;
```

### Find conversations with RAG sources

```sql
SELECT
  c.id as conversation_id,
  c.title,
  m.content,
  m.sources
FROM conversations c
JOIN messages m ON c.id = m.conversation_id
WHERE m.role = 'assistant'
  AND jsonb_array_length(m.sources) > 0
ORDER BY c.created_at DESC;
```

---

## Next Steps

1. ✅ Review schema
2. → Create migration files
3. → Run migrations on Supabase
4. → Set up vector schema (see `vector_schema.md`)
5. → Implement data access layer in backend

---

## See Also

- [Supabase Setup Guide](./supabase_setup.md)
- [Vector Schema Documentation](./vector_schema.md)
- [API Documentation](./api_documentation.md) (coming soon)
