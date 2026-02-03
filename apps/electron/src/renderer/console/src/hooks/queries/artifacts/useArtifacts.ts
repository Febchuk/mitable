/**
 * useArtifacts Hook
 *
 * React Query hook for fetching artifacts list.
 */

import { useQuery } from "@tanstack/react-query";
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

export function useArtifacts(params?: ListArtifactsParams) {
  const { user } = useUser();

  return useQuery({
    queryKey: artifactsKeys.list(params),
    queryFn: () => artifactsService.fetchArtifacts(params),
    enabled: !!user,
  });
}

export function useArtifact(id: string) {
  const { user } = useUser();

  return useQuery({
    queryKey: artifactsKeys.detail(id),
    queryFn: () => artifactsService.fetchArtifact(id),
    enabled: !!user && !!id,
  });
}

export function useArtifactText(id: string, enabled = true) {
  const { user } = useUser();

  return useQuery({
    queryKey: artifactsKeys.text(id),
    queryFn: () => artifactsService.fetchArtifactText(id),
    enabled: !!user && !!id && enabled,
  });
}
