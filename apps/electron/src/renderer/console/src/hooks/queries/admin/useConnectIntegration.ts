import { useMutation, useQueryClient } from '@tanstack/react-query';
import { connectIntegration, type ConnectIntegrationPayload } from '../../../services/adminService';

export function useConnectIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ integrationId, payload }: { integrationId: string; payload?: ConnectIntegrationPayload }) =>
      connectIntegration(integrationId, payload),

    onSuccess: () => {
      // Invalidate integrations query to refetch the list
      queryClient.invalidateQueries({ queryKey: ['admin', 'integrations'] });
    },
  });
}
