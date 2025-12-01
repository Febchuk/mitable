-- Add conversation summary fields for incremental memory management
ALTER TABLE conversations 
ADD COLUMN conversation_summary TEXT,
ADD COLUMN summary_up_to_turn INTEGER DEFAULT 0;

-- Add index for efficient lookups
CREATE INDEX idx_conversations_summary ON conversations(id) WHERE conversation_summary IS NOT NULL;
