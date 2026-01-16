-- Migration: Add gmail_selected_folders column to users table
-- This stores an array of Google Drive folder IDs that users have selected
-- for Google Docs export destinations

ALTER TABLE users ADD COLUMN gmail_selected_folders JSONB DEFAULT '[]'::jsonb;
