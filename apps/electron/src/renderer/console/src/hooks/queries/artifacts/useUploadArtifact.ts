/**
 * useUploadArtifact Hook
 *
 * React Query mutation hook for uploading artifacts.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as artifactsService from "../../../services/artifactsService";
import { artifactsKeys } from "./useArtifacts";

export function useUploadArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => artifactsService.uploadArtifact(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: artifactsKeys.lists() });
    },
  });
}
