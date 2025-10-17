import { useMutation, useQueryClient } from "@tanstack/react-query";
import { syncIntegration } from "../../../services/adminService";

export function useSyncIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (integrationId: string) => syncIntegration(integrationId),

    onSuccess: () => {
      // Invalidate integrations query to refetch with updated lastSyncedAt
      queryClient.invalidateQueries({ queryKey: ["admin", "integrations"] });
    },
  });
}
