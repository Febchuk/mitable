-- Migration 0048: Create agent chat persistence tables
--
-- Two new tables for storing agent (Claude SDK) conversations:
--   agent_conversations — chat sessions with title, user, org
--   agent_messages      — individual messages with tool call metadata

BEGIN;

-- Agent conversations
CREATE TABLE IF NOT EXISTS agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(255),
  session_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_conversations_user ON agent_conversations(user_id);
CREATE INDEX idx_agent_conversations_org ON agent_conversations(organization_id);
CREATE INDEX idx_agent_conversations_updated ON agent_conversations(updated_at DESC);

-- Agent messages
CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  tool_calls JSONB DEFAULT '[]',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_messages_conversation ON agent_messages(conversation_id);
CREATE INDEX idx_agent_messages_created ON agent_messages(conversation_id, created_at);

COMMIT;
