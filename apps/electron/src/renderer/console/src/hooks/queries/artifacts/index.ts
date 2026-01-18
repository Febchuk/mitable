/**
 * Artifacts Query Hooks
 *
 * React Query hooks for artifact management functionality.
 * Artifacts are uploaded files (PDFs, DOCX, images) used as source material
 * for document generation.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "../../../context/UserContext";
import * as artifactsService from "../../../services/artifactsService";
import type { ListArtifactsParams } from "../../../services/artifactsService";

// Query Keys
export const artifactsKeys = {
  all: ["artifacts"] as const,
  lists: () => [...artifactsKeys.all, "list"] as const,
  list: (params?: ListArtifactsParams) => [...artifactsKeys.lists(), params] as const,
  details: () => [...artifactsKeys.all, "detail"] as const,
  detail: (id: string) => [...artifactsKeys.details(), id] as const,
  text: (id: string) => [...artifactsKeys.detail(id), "text"] as const,
};

// ===========================
// List Artifacts
// ===========================

export function useArtifacts(params?: ListArtifactsParams) {
  const { user } = useUser();

  return useQuery({
    queryKey: artifactsKeys.list(params),
    queryFn: () => artifactsService.fetchArtifacts(params),
    enabled: !!user,
  });
}

// ===========================
// Get Single Artifact
// ===========================

export function useArtifact(id: string) {
  const { user } = useUser();

  return useQuery({
    queryKey: artifactsKeys.detail(id),
    queryFn: () => artifactsService.fetchArtifact(id),
    enabled: !!user && !!id,
  });
}

// ===========================
// Get Artifact Text
// ===========================

export function useArtifactText(id: string) {
  const { user } = useUser();

  return useQuery({
    queryKey: artifactsKeys.text(id),
    queryFn: () => artifactsService.fetchArtifactText(id),
    enabled: !!user && !!id,
  });
}

// ===========================
// Upload Artifact
// ===========================

export function useUploadArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => artifactsService.uploadArtifact(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: artifactsKeys.lists() });
    },
  });
}

// ===========================
// Delete Artifact
// ===========================

export function useDeleteArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => artifactsService.deleteArtifact(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: artifactsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: artifactsKeys.lists() });
    },
  });
}
