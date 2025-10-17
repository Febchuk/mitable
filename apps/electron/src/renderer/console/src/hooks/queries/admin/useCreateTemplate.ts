import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTemplate, type CreateTemplatePayload } from "../../../services/adminService";

export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateTemplatePayload) => createTemplate(payload),

    onSuccess: () => {
      // Invalidate templates query to refetch the list
      queryClient.invalidateQueries({ queryKey: ["admin", "templates"] });
    },
  });
}
