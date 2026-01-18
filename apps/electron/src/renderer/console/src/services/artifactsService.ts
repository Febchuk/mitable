/**
 * Artifacts Service
 *
 * API client for artifact management functionality.
 * Artifacts are uploaded files (PDFs, DOCX, images) used as source material
 * for document generation.
 */

import { apiRequest, apiRequestRaw } from "./api";
import type {
  Artifact,
  ListArtifactsResponse,
  UploadArtifactResponse,
  GetArtifactTextResponse,
} from "@mitable/shared";

// ===========================
// Upload Artifact
// ===========================

export async function uploadArtifact(file: File): Promise<UploadArtifactResponse> {
  const formData = new FormData();
  formData.append("file", file);

  // Use raw fetch for multipart/form-data uploads
  return apiRequestRaw<UploadArtifactResponse>("/artifacts", {
    method: "POST",
    body: formData,
    // Don't set Content-Type - browser will set it with boundary for multipart
  });
}

// ===========================
// List Artifacts
// ===========================

export interface ListArtifactsParams {
  page?: number;
  limit?: number;
}

export async function fetchArtifacts(params?: ListArtifactsParams): Promise<ListArtifactsResponse> {
  const searchParams = new URLSearchParams();

  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const query = searchParams.toString();
  const endpoint = `/artifacts${query ? `?${query}` : ""}`;

  return apiRequest<ListArtifactsResponse>(endpoint);
}

// ===========================
// Get Single Artifact
// ===========================

export async function fetchArtifact(id: string): Promise<Artifact> {
  return apiRequest<Artifact>(`/artifacts/${id}`);
}

// ===========================
// Get Artifact Text
// ===========================

export async function fetchArtifactText(id: string): Promise<GetArtifactTextResponse> {
  return apiRequest<GetArtifactTextResponse>(`/artifacts/${id}/text`);
}

// ===========================
// Delete Artifact
// ===========================

export async function deleteArtifact(id: string): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>(`/artifacts/${id}`, {
    method: "DELETE",
  });
}
