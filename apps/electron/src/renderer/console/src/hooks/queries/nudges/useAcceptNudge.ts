import { useMutation, useQueryClient } from "@tanstack/react-query";
import { acceptNudge as acceptNudgeAPI } from "../../../services/nudgesService";
import { useUser } from "../../../context/UserContext";

export function useAcceptNudge() {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: (nudgeId: string) => acceptNudgeAPI(nudgeId),

    // Optimistic update
    onMutate: async (nudgeId) => {
      await queryClient.cancelQueries({ queryKey: ["nudges", user?.id] });
      const previousNudges = queryClient.getQueryData(["nudges", user?.id]);

      queryClient.setQueryData(["nudges", user?.id], (old: any) =>
        old?.map((nudge: any) => (nudge.id === nudgeId ? { ...nudge, status: "accepted" } : nudge))
      );

      return { previousNudges };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousNudges) {
        queryClient.setQueryData(["nudges", user?.id], context.previousNudges);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["nudges", user?.id] });
    },
  });
}
