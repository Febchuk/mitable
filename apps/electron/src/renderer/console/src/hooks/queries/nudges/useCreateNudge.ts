import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createNudge as createNudgeAPI, CreateNudgeRequest } from "../../../services/nudgesService";
import { useUser } from "../../../context/UserContext";

export function useCreateNudge() {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: (data: CreateNudgeRequest) => createNudgeAPI(data),

    onSuccess: () => {
      // Invalidate nudges query to refetch the list
      queryClient.invalidateQueries({ queryKey: ["nudges", user?.id] });
    },

    onError: (error) => {
      console.error("Error creating nudge:", error);
    },
  });
}
