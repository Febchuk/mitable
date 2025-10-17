import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateIntegrationSettings } from '../../../services/adminService';

export function useUpdateIntegrationSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ integrationId, metadata }: { integrationId: string; metadata: Record<string, any> }) =>
      updateIntegrationSettings(integrationId, metadata),

    onSuccess: () => {
      // Invalidate integrations query to refetch with updated settings
      queryClient.invalidateQueries({ queryKey: ['admin', 'integrations'] });
    },
  });
}
