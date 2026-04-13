/**
 * useDeleteArtifact Hook
 *
 * React Query mutation hook for deleting artifacts.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as artifactsService from "../../../services/artifactsService";
import { artifactsKeys } from "./useArtifacts";

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
