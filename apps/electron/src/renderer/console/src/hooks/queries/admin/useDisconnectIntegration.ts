import { useMutation, useQueryClient } from "@tanstack/react-query";
import { disconnectIntegration } from "../../../services/adminService";

export function useDisconnectIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (integrationId: string) => disconnectIntegration(integrationId),

    onSuccess: () => {
      // Invalidate integrations query to refetch the list
      queryClient.invalidateQueries({ queryKey: ["admin", "integrations"] });
    },
  });
}
