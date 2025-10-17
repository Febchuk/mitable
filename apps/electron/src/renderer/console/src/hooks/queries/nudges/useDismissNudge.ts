import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dismissNudge as dismissNudgeAPI } from '../../../services/nudgesService';
import { useUser } from '../../../context/UserContext';

export function useDismissNudge() {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: (nudgeId: string) => dismissNudgeAPI(nudgeId),

    // Optimistic update - remove from list
    onMutate: async (nudgeId) => {
      await queryClient.cancelQueries({ queryKey: ['nudges', user?.id] });
      const previousNudges = queryClient.getQueryData(['nudges', user?.id]);

      queryClient.setQueryData(['nudges', user?.id], (old: any) =>
        old?.filter((nudge: any) => nudge.id !== nudgeId)
      );

      return { previousNudges };
    },

    onError: (err, variables, context) => {
      if (context?.previousNudges) {
        queryClient.setQueryData(['nudges', user?.id], context.previousNudges);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['nudges', user?.id] });
    },
  });
}
