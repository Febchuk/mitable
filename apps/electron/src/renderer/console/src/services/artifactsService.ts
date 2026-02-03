/**
 * Artifacts Service
 *
 * API client for artifact upload and management functionality.
 */

import { apiRequest, API_BASE_URL } from "./api";
import { getAuthToken } from "./api";

// ===========================
// Types
// ===========================

export type ExtractionStatus = "pending" | "processing" | "completed" | "failed" | "skipped";
export type EmbeddingStatus = "pending" | "processing" | "completed" | "failed" | "skipped";

export interface Artifact {
  id: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  extractionStatus: ExtractionStatus;
  embeddingStatus: EmbeddingStatus;
  hasExtractedText: boolean;
  textPreview: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactsResponse {
  artifacts: Artifact[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ArtifactDetailResponse {
  artifact: Artifact;
  downloadUrl: string;
}

export interface ArtifactTextResponse {
  extractedText: string;
  wordCount: number;
}

// ===========================
// List Artifacts
// ===========================

export interface ListArtifactsParams {
  page?: number;
  limit?: number;
}

export async function fetchArtifacts(params?: ListArtifactsParams): Promise<ArtifactsResponse> {
  const searchParams = new URLSearchParams();

  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const query = searchParams.toString();
  const endpoint = `/artifacts${query ? `?${query}` : ""}`;

  return apiRequest<ArtifactsResponse>(endpoint);
}

// ===========================
// Get Single Artifact
// ===========================

export async function fetchArtifact(id: string): Promise<ArtifactDetailResponse> {
  return apiRequest<ArtifactDetailResponse>(`/artifacts/${id}`);
}

// ===========================
// Upload Artifact
// ===========================

export async function uploadArtifact(file: File): Promise<{ artifact: Artifact }> {
  const formData = new FormData();
  formData.append("file", file);

  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/api/artifacts`, {
    method: "POST",
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: "Upload failed",
      message: response.statusText,
    }));
    throw new Error(error.message || `Upload failed: ${response.statusText}`);
  }

  return response.json();
}

// ===========================
// Delete Artifact
// ===========================

export async function deleteArtifact(id: string): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>(`/artifacts/${id}`, {
    method: "DELETE",
  });
}

// ===========================
// Get Artifact Text
// ===========================

export async function fetchArtifactText(id: string): Promise<ArtifactTextResponse> {
  return apiRequest<ArtifactTextResponse>(`/artifacts/${id}/text`);
}
