/**
 * Artifacts (Knowledge Sources) - Shared Types
 *
 * Types shared between backend and frontend for user-uploaded files
 * and pasted text used as context for document generation.
 */

// Artifact type enum
export type ArtifactType = "file" | "text";

// Artifact status enum
export type ArtifactStatus = "active" | "archived";

/**
 * Artifact - Full artifact object
 */
export interface Artifact {
    id: string;
    organizationId: string;
    userId: string;
    title: string;
    type: ArtifactType;
    url: string | null;
    fileType: string | null;
    size: number | null;
    content: string | null;
    status: ArtifactStatus;
    createdAt: string;
    updatedAt: string;
}

/**
 * Create Artifact Request
 */
export interface CreateArtifactRequest {
    title: string;
    type: ArtifactType;
    url?: string;
    fileType?: string;
    size?: number;
    content?: string;
}

/**
 * List Artifacts Response
 */
export interface ListArtifactsResponse {
    artifacts: Artifact[];
    total: number;
}

/**
 * Delete Artifact Response
 */
export interface DeleteArtifactResponse {
    success: boolean;
    message: string;
}

