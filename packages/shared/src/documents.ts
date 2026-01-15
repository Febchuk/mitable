/**
 * Documents (Knowledge Base) - Shared Types
 *
 * Types shared between backend and frontend for the documentation feature.
 */

// Document type enum
export type DocType = "how-to" | "knowledge-article" | "troubleshooting";

// Document status enum
export type DocStatus = "draft" | "published" | "archived";

// Change type for version history
export type ChangeType = "created" | "user_edit" | "ai_revision" | "session_update";

// Contribution type for session-document links
export type ContributionType = "source" | "update" | "enhancement";

// Notion sync status
export type NotionSyncStatus = "pending" | "synced" | "error" | null;

/**
 * Document - Full document object
 */
export interface Document {
  id: string;
  organizationId: string;
  createdBy: string;
  title: string;
  docType: DocType;
  status: DocStatus;
  description: string | null;
  tags: string[];
  content: string;
  notionPageId: string | null;
  notionSyncStatus: NotionSyncStatus;
  notionSyncedAt: string | null;
  notionSyncError: string | null;
  googleDocsId: string | null;
  googleDocsFolderId: string | null;
  googleDocsSyncStatus: NotionSyncStatus; // Reuse same status type
  googleDocsSyncedAt: string | null;
  googleDocsSyncError: string | null;
  generationModel: string | null;
  generationPromptVersion: number | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  // Relations (optional, populated when joined)
  creator?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  sessionContributions?: SessionDocumentContribution[];
}

/**
 * Document Version - Version history entry
 */
export interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  content: string;
  changeSummary: string | null;
  changedBy: string | null;
  changeType: ChangeType;
  createdAt: string;
  // Relations
  changedByUser?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

/**
 * Session-Document Contribution - Links sessions to documents
 */
export interface SessionDocumentContribution {
  id: string;
  sessionId: string;
  documentId: string;
  contributionType: ContributionType;
  insightsUsed: SessionInsight[];
  createdAt: string;
  // Relations
  session?: {
    id: string;
    name: string | null;
    startedAt: string;
    endedAt: string | null;
  };
}

/**
 * Session Insight - Insight extracted from a session for doc generation
 */
export interface SessionInsight {
  activity: string;
  appName?: string;
  timestamp?: string;
  confidence?: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Create Document Request
 */
export interface CreateDocumentRequest {
  title: string;
  docType: DocType;
  content: string;
  description?: string;
  tags?: string[];
  status?: DocStatus;
}

/**
 * Update Document Request
 */
export interface UpdateDocumentRequest {
  title?: string;
  content?: string;
  description?: string;
  tags?: string[];
  status?: DocStatus;
}

/**
 * Generate Document Request
 */
export interface GenerateDocumentRequest {
  sessionId: string;
  docType: DocType;
  title?: string;
  additionalContext?: string;
}

/**
 * Generate Document Response
 */
export interface GenerateDocumentResponse {
  document: Document;
  generationMetadata: {
    model: string;
    tokenCount?: number;
    generationTimeMs: number;
  };
}

/**
 * Enhance Document Request
 */
export interface EnhanceDocumentRequest {
  sessionId: string;
  enhancementType: "append" | "merge" | "supplement";
  userNotes?: string;
}

/**
 * Enhance Document Response
 */
export interface EnhanceDocumentResponse {
  document: Document;
  changesApplied: string[];
  newVersion: number;
}

/**
 * Revise Document Request
 */
export interface ReviseDocumentRequest {
  instruction: string;
  currentContent: string;
}

/**
 * Revise Document Response
 */
export interface ReviseDocumentResponse {
  suggestion: string;
}

/**
 * Export to Notion Request
 */
export interface ExportNotionRequest {
  parentPageId?: string;
  workspaceId?: string;
}

/**
 * Export to Notion Response
 */
export interface ExportNotionResponse {
  success: boolean;
  notionPageId: string;
  notionPageUrl: string;
}

/**
 * List Documents Query Params
 */
export interface ListDocumentsParams {
  docType?: DocType;
  status?: DocStatus;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * List Documents Response
 */
export interface ListDocumentsResponse {
  documents: Document[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Doc Type Labels - Human-readable labels for doc types
 */
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  "how-to": "How-To Guide",
  "knowledge-article": "Knowledge Article",
  troubleshooting: "Troubleshooting Guide",
};

/**
 * Doc Type Descriptions - Short descriptions for each doc type
 */
export const DOC_TYPE_DESCRIPTIONS: Record<DocType, string> = {
  "how-to": "Step-by-step instructions for completing a task",
  "knowledge-article": "Reference documentation explaining concepts or systems",
  troubleshooting: "Problem → Solution guide for common issues",
};

/**
 * Doc Status Labels - Human-readable labels for statuses
 */
export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};
