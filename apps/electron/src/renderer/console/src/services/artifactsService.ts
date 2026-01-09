/**
 * Artifacts Service
 *
 * API client for artifacts (uploaded files and pasted text) functionality.
 */

import { apiRequest } from "./api";
import type {
    Artifact,
    CreateArtifactRequest,
    ListArtifactsResponse,
    DeleteArtifactResponse,
} from "@mitable/shared";

// ===========================
// List Artifacts
// ===========================

export async function fetchArtifacts(): Promise<ListArtifactsResponse> {
    return apiRequest<ListArtifactsResponse>("/artifacts");
}

// ===========================
// Create Artifact
// ===========================

export async function createArtifact(data: CreateArtifactRequest): Promise<Artifact> {
    return apiRequest<Artifact>("/artifacts", {
        method: "POST",
        body: JSON.stringify(data),
    });
}

// ===========================
// Delete Artifact
// ===========================

export async function deleteArtifact(id: string): Promise<DeleteArtifactResponse> {
    return apiRequest<DeleteArtifactResponse>(`/artifacts/${id}`, {
        method: "DELETE",
    });
}

