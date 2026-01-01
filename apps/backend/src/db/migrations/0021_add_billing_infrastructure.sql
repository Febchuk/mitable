-- Migration: Add billing infrastructure
-- Adds is_internal flag to organizations for test account handling

-- Add is_internal column to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT FALSE;

-- Mark Lorikeet as internal (test organization)
UPDATE organizations SET is_internal = TRUE WHERE domain = 'lorikeet.ai';

-- Update Febe's Workspace to team tier for beta (everyone gets unlimited during beta)
UPDATE subscriptions
SET tier = 'team', updated_at = NOW()
WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Febe''s Workspace');

-- Add comment for documentation
COMMENT ON COLUMN organizations.is_internal IS 'Internal/test organizations bypass quota limits and billing';
