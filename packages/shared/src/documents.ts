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
// Artifact Types
// ============================================================================

/**
 * Artifact Extraction Status
 */
export type ExtractionStatus = "pending" | "processing" | "completed" | "failed" | "skipped";

/**
 * Artifact Embedding Status
 */
export type EmbeddingStatus = "pending" | "processing" | "completed" | "failed" | "skipped";

/**
 * Artifact Contribution Type
 */
export type ArtifactContributionType = "source" | "reference";

/**
 * Artifact Metadata
 */
export interface ArtifactMetadata {
  pageCount?: number;
  wordCount?: number;
  characterCount?: number;
  dimensions?: {
    width: number;
    height: number;
  };
  encoding?: string;
  extractionMethod?: string;
}

/**
 * Artifact - Uploaded file for document generation
 */
export interface Artifact {
  id: string;
  organizationId: string;
  uploadedBy: string;
  filename: string;
  mimeType: string;
  storageUrl: string;
  storageKey: string;
  fileSizeBytes: number;
  extractedText: string | null;
  extractionStatus: ExtractionStatus;
  extractionError: string | null;
  embeddingStatus: EmbeddingStatus;
  embeddingError: string | null;
  pineconeIds: string[];
  metadata: ArtifactMetadata;
  createdAt: string;
  updatedAt: string;
  // Computed fields (added by API)
  fileSizeFormatted?: string;
  hasExtractedText?: boolean;
  textPreview?: string | null;
  downloadUrl?: string;
}

/**
 * Document Artifact Source - Links artifacts to documents
 */
export interface DocumentArtifactSource {
  id: string;
  documentId: string;
  artifactId: string;
  contributionType: ArtifactContributionType;
  createdAt: string;
  // Relations
  artifact?: Artifact;
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
 * Generate Document Request (supports both single and multi-session)
 */
export interface GenerateDocumentRequest {
  /** @deprecated Use sessionIds instead */
  sessionId?: string;
  sessionIds?: string[];
  artifactIds?: string[];
  docType: DocType;
  title?: string;
  additionalContext?: string;
  mergeStrategy?: "chronological" | "thematic";
}

/**
 * Generate Document Response (single session)
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
 * Multi-Session Generate Document Response
 */
export interface MultiSessionGenerateDocumentResponse {
  document: Document;
  generationMetadata: {
    model: string;
    tokenCount?: number;
    generationTimeMs: number;
    sessionsUsed: number;
    artifactsUsed: number;
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

// ============================================================================
// Artifact API Request/Response Types
// ============================================================================

/**
 * Upload Artifact Response
 */
export interface UploadArtifactResponse {
  success: boolean;
  artifact: Artifact;
}

/**
 * List Artifacts Response
 */
export interface ListArtifactsResponse {
  artifacts: Artifact[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Get Artifact Text Response
 */
export interface GetArtifactTextResponse {
  id: string;
  filename: string;
  extractedText: string | null;
  extractionStatus: ExtractionStatus;
  wordCount: number;
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
